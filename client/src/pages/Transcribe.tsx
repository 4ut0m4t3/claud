import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTranscriptions, uploadVideo, deleteTranscription } from '../api/client';
import type { Transcription } from '../types';

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing') return <span className="badge-yellow">Transcribing...</span>;
  if (status === 'error') return <span className="badge-red">Error</span>;
  return <span className="badge-green">Complete</span>;
}

function formatDuration(seconds?: number) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Transcribe() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: transcriptions = [] } = useQuery<Transcription[]>({
    queryKey: ['transcriptions'],
    queryFn: getTranscriptions,
    refetchInterval: 3000,
  });

  const VIDEO_TYPES = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.m4v', '.flv', '.wmv'];

  async function handleFile(file: File) {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!VIDEO_TYPES.includes(ext)) {
      setUploadError('Unsupported format. Use: mp4, avi, mkv, mov, webm, m4v, flv, or wmv.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadVideo(file);
      await qc.invalidateQueries({ queryKey: ['transcriptions'] });
    } catch {
      setUploadError('Upload failed. Make sure the server is running and OPENAI_API_KEY is set.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  async function handleDelete(id: string) {
    await deleteTranscription(id);
    qc.invalidateQueries({ queryKey: ['transcriptions'] });
    if (expandedId === id) setExpandedId(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Video Transcription</h1>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-brand-500 bg-brand-900/20'
            : 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="text-4xl mb-3">🎬</div>
        <p className="font-medium text-slate-200">
          {uploading ? 'Uploading video...' : 'Drop a video here or click to browse'}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Supports MP4, AVI, MKV, MOV, WebM and more — audio will be extracted and transcribed
        </p>
        {uploading && (
          <div className="mt-4 flex justify-center">
            <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="card border-red-900 bg-red-950/30 text-red-400 text-sm">{uploadError}</div>
      )}

      <div className="card bg-slate-900/50 text-sm text-slate-400 space-y-1.5">
        <p className="font-medium text-slate-300">How it works</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Upload a video file (up to 500MB)</li>
          <li>Audio is extracted using FFmpeg</li>
          <li>OpenAI Whisper transcribes the speech to text</li>
          <li>Long videos are automatically split into chunks for processing</li>
          <li>View, copy, or download the full transcript</li>
        </ol>
      </div>

      {/* Transcription list */}
      {transcriptions.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3">Transcriptions</h2>
          <div className="space-y-2">
            {transcriptions.map(t => (
              <div key={t.id} className="card">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.original_name}</p>
                    <p className="text-sm text-slate-500">
                      Duration: {formatDuration(t.duration_seconds)}
                      {' · '}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={t.status} />
                    {t.status === 'complete' && t.transcript && (
                      <>
                        <button
                          onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          {expandedId === t.id ? 'Hide' : 'View'}
                        </button>
                        <button
                          onClick={() => copyToClipboard(t.transcript!)}
                          className="btn-secondary text-xs py-1 px-2"
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {t.status === 'error' && t.error_message && (
                  <div className="mt-3 text-sm text-red-400 bg-red-950/30 rounded-lg p-3">
                    {t.error_message}
                  </div>
                )}

                {/* Expanded transcript */}
                {expandedId === t.id && t.transcript && (
                  <div className="mt-3 bg-slate-950 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                    {t.transcript}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
