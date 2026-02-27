import { Router } from 'express';
import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rooms = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM tenants t WHERE t.room_id = r.id AND t.status = 'active') as active_tenants,
      (SELECT t.name FROM tenants t WHERE t.room_id = r.id AND t.status = 'active' LIMIT 1) as current_tenant_name,
      (SELECT t.id FROM tenants t WHERE t.room_id = r.id AND t.status = 'active' LIMIT 1) as current_tenant_id
    FROM rooms r
    ORDER BY r.name
  `).all();
  res.json(rooms);
});

router.post('/', (req, res) => {
  const { name, description, monthly_rent } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO rooms (id, name, description, monthly_rent) VALUES (?, ?, ?, ?)')
    .run(id, name, description || null, monthly_rent || null);

  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, description, monthly_rent } = req.body;
  const db = getDb();
  db.prepare('UPDATE rooms SET name = ?, description = ?, monthly_rent = ? WHERE id = ?')
    .run(name, description || null, monthly_rent || null, req.params.id);
  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
