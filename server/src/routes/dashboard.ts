import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// Dashboard summary — payment status per room/tenant across all months
router.get('/summary', (_req, res) => {
  const db = getDb();

  const rooms = db.prepare(`
    SELECT r.*,
      t.id as tenant_id, t.name as tenant_name, t.start_date, t.end_date, t.status as tenant_status
    FROM rooms r
    LEFT JOIN tenants t ON t.room_id = r.id AND t.status = 'active'
    ORDER BY r.name
  `).all() as Array<{
    id: string;
    name: string;
    monthly_rent: number;
    tenant_id: string | null;
    tenant_name: string | null;
    start_date: string | null;
    tenant_status: string | null;
  }>;

  const result = rooms.map(room => {
    // Get all payment expectations for this room
    const expectations = db.prepare(`
      SELECT pe.*, ten.name as tenant_name
      FROM payment_expectations pe
      LEFT JOIN tenants ten ON pe.tenant_id = ten.id
      WHERE pe.room_id = ?
      ORDER BY pe.expected_year ASC, pe.expected_month ASC
    `).all(room.id) as Array<{
      expected_month: number;
      expected_year: number;
      status: string;
      tenant_name: string;
      transaction_id: string | null;
    }>;

    // Find gaps — months where payment was expected but not recorded
    const gaps = expectations.filter(e => e.status !== 'paid');

    // Most recent payment
    const lastPaid = expectations.filter(e => e.status === 'paid').slice(-1)[0];

    return {
      room_id: room.id,
      room_name: room.name,
      monthly_rent: room.monthly_rent,
      tenant_id: room.tenant_id,
      tenant_name: room.tenant_name,
      tenant_status: room.tenant_status,
      payment_expectations: expectations,
      gaps,
      last_paid: lastPaid ? `${lastPaid.expected_year}-${String(lastPaid.expected_month).padStart(2, '0')}` : null,
      payment_health: gaps.length === 0 ? 'good' : gaps.length <= 1 ? 'warning' : 'critical',
    };
  });

  res.json(result);
});

// Overall financial summary across all invoices
router.get('/financials', (_req, res) => {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as total_expenses,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE reviewed = 1 OR confidence >= 0.8
  `).get() as { total_income: number; total_expenses: number; transaction_count: number };

  const byCategory = db.prepare(`
    SELECT c.name, c.color, c.type,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE (t.reviewed = 1 OR t.confidence >= 0.8)
    GROUP BY t.category_id
    ORDER BY total DESC
  `).all();

  const byMonth = db.prepare(`
    SELECT
      i.year, i.month,
      SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
      SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as expenses
    FROM transactions t
    JOIN invoices i ON t.invoice_id = i.id
    WHERE (t.reviewed = 1 OR t.confidence >= 0.8) AND i.year IS NOT NULL AND i.month IS NOT NULL
    GROUP BY i.year, i.month
    ORDER BY i.year ASC, i.month ASC
  `).all();

  res.json({ totals, byCategory, byMonth });
});

// Timeline data — room occupancy and payment status across months
router.get('/timeline', (_req, res) => {
  const db = getDb();

  const rooms = db.prepare('SELECT * FROM rooms ORDER BY name').all() as Array<{ id: string; name: string; monthly_rent: number }>;

  const allExpectations = db.prepare(`
    SELECT pe.*, ten.name as tenant_name, r.name as room_name
    FROM payment_expectations pe
    LEFT JOIN tenants ten ON pe.tenant_id = ten.id
    LEFT JOIN rooms r ON pe.room_id = r.id
    ORDER BY pe.expected_year ASC, pe.expected_month ASC
  `).all() as Array<{
    room_id: string;
    tenant_id: string;
    tenant_name: string;
    room_name: string;
    expected_month: number;
    expected_year: number;
    status: string;
  }>;

  const tenants = db.prepare(`
    SELECT t.*, r.name as room_name
    FROM tenants t
    LEFT JOIN rooms r ON t.room_id = r.id
    ORDER BY t.start_date ASC
  `).all() as Array<{
    id: string;
    name: string;
    room_id: string;
    room_name: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
  }>;

  // Get all unique year-month combos from invoices
  const months = db.prepare(`
    SELECT DISTINCT year, month FROM invoices
    WHERE year IS NOT NULL AND month IS NOT NULL
    ORDER BY year ASC, month ASC
  `).all() as Array<{ year: number; month: number }>;

  res.json({ rooms, tenants, allExpectations, months });
});

// Categories
router.get('/categories', (_req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY type, name').all());
});

export default router;
