import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import OpenAI from 'openai';
import { getDb } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.m4v', '.flv', '.wmv'];

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, VIDEO_EXTENSIONS.includes(ext));
  },
});

const router = Router();

// List all transcriptions
router.get('/', (_req, res) => {
  const db = getDb();
  const transcriptions = db.prepare(`
    SELECT * FROM transcriptions ORDER BY created_at DESC
  `).all();
  res.json(transcriptions);
});

// Get single transcription
router.get('/:id', (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM transcriptions WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// Upload video and transcribe
router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided. Supported formats: mp4, avi, mkv, mov, webm, m4v, flv, wmv' });

  const db = getDb();
  const transcriptionId = uuidv4();

  db.prepare(`
    INSERT INTO transcriptions (id, filename, original_name, status)
    VALUES (?, ?, ?, 'processing')
  `).run(transcriptionId, req.file.filename, req.file.originalname);

  // Process async
  processTranscription(transcriptionId, req.file.path).catch(err => {
    console.error('Transcription error:', err);
    db.prepare("UPDATE transcriptions SET status = 'error', error_message = ? WHERE id = ?")
      .run(err.message || 'Unknown error', transcriptionId);
  });

  res.json({ id: transcriptionId, status: 'processing' });
});

async function processTranscription(transcriptionId: string, videoPath: string) {
  const db = getDb();
  const audioPath = videoPath.replace(/\.[^.]+$/, '.mp3');

  try {
    // Extract audio from video
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libmp3lame')
        .audioChannels(1)
        .audioFrequency(16000)
        .noVideo()
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`Audio extraction failed: ${err.message}`)))
        .run();
    });

    // Get duration
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration ?? 0);
      });
    });

    db.prepare('UPDATE transcriptions SET duration_seconds = ? WHERE id = ?')
      .run(duration, transcriptionId);

    // Transcribe with OpenAI Whisper
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Whisper has a 25MB file size limit — split if needed
    const stats = fs.statSync(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    let transcript: string;

    if (fileSizeMB <= 24) {
      // Direct transcription
      const result = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'text',
      });
      transcript = result as unknown as string;
    } else {
      // Split into chunks and transcribe each
      transcript = await transcribeLargeFile(openai, audioPath, duration);
    }

    db.prepare("UPDATE transcriptions SET transcript = ?, status = 'complete' WHERE id = ?")
      .run(transcript, transcriptionId);
  } finally {
    // Clean up audio file
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

async function transcribeLargeFile(openai: OpenAI, audioPath: string, duration: number): Promise<string> {
  const CHUNK_DURATION = 600; // 10 minutes per chunk
  const chunks = Math.ceil(duration / CHUNK_DURATION);
  const transcripts: string[] = [];
  const dir = path.dirname(audioPath);

  for (let i = 0; i < chunks; i++) {
    const chunkPath = path.join(dir, `chunk_${i}_${path.basename(audioPath)}`);
    const startTime = i * CHUNK_DURATION;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(CHUNK_DURATION)
        .output(chunkPath)
        .audioCodec('libmp3lame')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    try {
      const result = await openai.audio.transcriptions.create({
        file: fs.createReadStream(chunkPath),
        model: 'whisper-1',
        response_format: 'text',
      });
      transcripts.push(result as unknown as string);
    } finally {
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    }
  }

  return transcripts.join(' ');
}

// Delete transcription
router.delete('/:id', (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT filename FROM transcriptions WHERE id = ?').get(req.params.id) as { filename: string } | undefined;
  if (t) {
    const filePath = path.join(UPLOADS_DIR, t.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM transcriptions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
