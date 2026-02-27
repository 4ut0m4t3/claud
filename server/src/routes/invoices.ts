import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { extractTextFromPdf } from '../services/pdfExtractor.js';
import { parseInvoiceWithClaude } from '../services/claudeParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype === 'application/pdf');
}});

const router = Router();

// List all invoices (oldest first)
router.get('/', (_req, res) => {
  const db = getDb();
  const invoices = db.prepare(`
    SELECT i.*,
      (SELECT COUNT(*) FROM transactions t WHERE t.invoice_id = i.id) as transaction_count,
      (SELECT COUNT(*) FROM transactions t WHERE t.invoice_id = i.id AND t.reviewed = 0 AND t.confidence < 0.8) as needs_review_count
    FROM invoices i
    ORDER BY i.year ASC, i.month ASC, i.uploaded_at ASC
  `).all();
  res.json(invoices);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  res.json(invoice);
});

// Upload and process
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file provided' });

  const db = getDb();
  const invoiceId = uuidv4();

  db.prepare(`
    INSERT INTO invoices (id, filename, original_name, status)
    VALUES (?, ?, ?, 'processing')
  `).run(invoiceId, req.file.filename, req.file.originalname);

  // Process async
  processInvoice(invoiceId, req.file.path).catch(err => {
    console.error('Invoice processing error:', err);
    db.prepare("UPDATE invoices SET status = 'review' WHERE id = ?").run(invoiceId);
  });

  res.json({ id: invoiceId, status: 'processing' });
});

async function processInvoice(invoiceId: string, filePath: string) {
  const db = getDb();

  // Extract text
  const rawText = await extractTextFromPdf(filePath);
  db.prepare('UPDATE invoices SET raw_text = ? WHERE id = ?').run(rawText, invoiceId);

  // Get known tenants and rooms for context
  const knownTenants = db.prepare('SELECT t.name, r.name as room FROM tenants t LEFT JOIN rooms r ON t.room_id = r.id').all() as { name: string; room: string }[];
  const knownRooms = db.prepare('SELECT name FROM rooms').all() as { name: string }[];

  // Parse with Claude
  const parsed = await parseInvoiceWithClaude(rawText, knownTenants, knownRooms);

  // Update invoice month/year
  db.prepare('UPDATE invoices SET month = ?, year = ? WHERE id = ?')
    .run(parsed.detected_month, parsed.detected_year, invoiceId);

  // Find category IDs
  const getCategoryId = (name: string): string | null => {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: string } | undefined;
    if (cat) return cat.id;
    // Try partial match
    const cats = db.prepare('SELECT id, name FROM categories').all() as { id: string; name: string }[];
    const match = cats.find(c => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()));
    return match?.id ?? null;
  };

  const findTenantId = (name: string | null): string | null => {
    if (!name) return null;
    const t = db.prepare("SELECT id FROM tenants WHERE LOWER(name) LIKE ? AND status = 'active'")
      .get(`%${name.toLowerCase()}%`) as { id: string } | undefined;
    return t?.id ?? null;
  };

  const findRoomId = (name: string | null): string | null => {
    if (!name) return null;
    const r = db.prepare('SELECT id FROM rooms WHERE LOWER(name) LIKE ?')
      .get(`%${name.toLowerCase()}%`) as { id: string } | undefined;
    return r?.id ?? null;
  };

  // Insert transactions
  const insertTx = db.prepare(`
    INSERT INTO transactions (id, invoice_id, date, description, amount, type, category_id, tenant_id, room_id, confidence, ai_reasoning, reviewed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  for (const tx of parsed.transactions) {
    const txId = uuidv4();
    const categoryId = getCategoryId(tx.suggested_category);
    const tenantId = findTenantId(tx.suggested_tenant_name);
    const roomId = findRoomId(tx.suggested_room_name);

    insertTx.run(
      txId,
      invoiceId,
      tx.date,
      tx.description,
      tx.amount,
      tx.type,
      categoryId,
      tenantId,
      roomId,
      tx.confidence,
      tx.ai_reasoning
    );

    // If high confidence rent payment with known tenant, create payment expectation
    if (tx.is_rent_payment && tx.confidence >= 0.8 && tenantId && parsed.detected_month && parsed.detected_year) {
      const roomIdForExpectation = roomId ?? (tenantId ? (db.prepare('SELECT room_id FROM tenants WHERE id = ?').get(tenantId) as { room_id: string } | undefined)?.room_id : null);
      if (roomIdForExpectation) {
        const existing = db.prepare(`
          SELECT id FROM payment_expectations
          WHERE tenant_id = ? AND expected_month = ? AND expected_year = ?
        `).get(tenantId, parsed.detected_month, parsed.detected_year);

        if (!existing) {
          db.prepare(`
            INSERT INTO payment_expectations (id, tenant_id, room_id, expected_month, expected_year, transaction_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'paid')
          `).run(uuidv4(), tenantId, roomIdForExpectation, parsed.detected_month, parsed.detected_year, txId);
        }
      }
    }
  }

  // Mark as ready for review if any low-confidence transactions
  const needsReview = parsed.transactions.some(t => t.confidence < 0.8);
  db.prepare("UPDATE invoices SET status = ? WHERE id = ?")
    .run(needsReview ? 'review' : 'complete', invoiceId);
}

// Get transactions for an invoice
router.get('/:id/transactions', (req, res) => {
  const db = getDb();
  const txs = db.prepare(`
    SELECT t.*,
      c.name as category_name, c.color as category_color,
      ten.name as tenant_name,
      r.name as room_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN tenants ten ON t.tenant_id = ten.id
    LEFT JOIN rooms r ON t.room_id = r.id
    WHERE t.invoice_id = ?
    ORDER BY t.date ASC, t.created_at ASC
  `).all(req.params.id);
  res.json(txs);
});

// Update a transaction (user review)
router.patch('/transactions/:txId', (req, res) => {
  const { category_id, tenant_id, room_id, user_confirmed, reviewed } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE transactions
    SET category_id = COALESCE(?, category_id),
        tenant_id = COALESCE(?, tenant_id),
        room_id = COALESCE(?, room_id),
        user_confirmed = COALESCE(?, user_confirmed),
        reviewed = COALESCE(?, reviewed)
    WHERE id = ?
  `).run(category_id ?? null, tenant_id ?? null, room_id ?? null, user_confirmed ?? null, reviewed ?? null, req.params.txId);

  const tx = db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color,
      ten.name as tenant_name, r.name as room_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN tenants ten ON t.tenant_id = ten.id
    LEFT JOIN rooms r ON t.room_id = r.id
    WHERE t.id = ?
  `).get(req.params.txId);

  res.json(tx);
});

// Mark invoice complete
router.post('/:id/complete', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE invoices SET status = 'complete' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM transactions WHERE invoice_id = ?').run(req.params.id);
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
