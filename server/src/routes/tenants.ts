import { Router } from 'express';
import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { suggestTenantStatus } from '../services/claudeParser.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT t.*, r.name as room_name, r.monthly_rent
    FROM tenants t
    LEFT JOIN rooms r ON t.room_id = r.id
    ORDER BY t.status, t.name
  `).all();
  res.json(tenants);
});

router.post('/', (req, res) => {
  const { name, room_id, start_date, end_date, status, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO tenants (id, name, room_id, start_date, end_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, room_id || null, start_date || null, end_date || null, status || 'active', notes || null);

  res.json(db.prepare('SELECT t.*, r.name as room_name FROM tenants t LEFT JOIN rooms r ON t.room_id = r.id WHERE t.id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, room_id, start_date, end_date, status, notes } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE tenants SET name = ?, room_id = ?, start_date = ?, end_date = ?, status = ?, notes = ?
    WHERE id = ?
  `).run(name, room_id || null, start_date || null, end_date || null, status || 'active', notes || null, req.params.id);
  res.json(db.prepare('SELECT t.*, r.name as room_name FROM tenants t LEFT JOIN rooms r ON t.room_id = r.id WHERE t.id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// AI-powered status suggestion
router.get('/:id/status-suggestion', async (req, res) => {
  const db = getDb();

  const tenant = db.prepare(`
    SELECT t.*, r.name as room_name FROM tenants t
    LEFT JOIN rooms r ON t.room_id = r.id
    WHERE t.id = ?
  `).get(req.params.id) as { name: string; room_name: string } | undefined;

  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Get payment expectations
  const expectations = db.prepare(`
    SELECT pe.*, t2.amount
    FROM payment_expectations pe
    LEFT JOIN transactions t2 ON pe.transaction_id = t2.id
    WHERE pe.tenant_id = ?
    ORDER BY pe.expected_year, pe.expected_month
  `).all(req.params.id) as Array<{
    expected_month: number;
    expected_year: number;
    status: string;
    amount?: number;
  }>;

  const history = expectations.map(e => ({
    month: e.expected_month,
    year: e.expected_year,
    paid: e.status === 'paid',
    amount: e.amount,
  }));

  try {
    const suggestion = await suggestTenantStatus(tenant.name, tenant.room_name, history);
    res.json(suggestion);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
