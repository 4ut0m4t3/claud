import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/hmo.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      monthly_rent REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'left', 'unknown')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6B7280',
      type TEXT NOT NULL DEFAULT 'expense' CHECK(type IN ('income', 'expense', 'transfer'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      month INTEGER,
      year INTEGER,
      raw_text TEXT,
      status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'review', 'complete')),
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id),
      date TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
      category_id TEXT REFERENCES categories(id),
      tenant_id TEXT REFERENCES tenants(id),
      room_id TEXT REFERENCES rooms(id),
      confidence REAL NOT NULL DEFAULT 0,
      ai_reasoning TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      user_confirmed INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_expectations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      room_id TEXT NOT NULL REFERENCES rooms(id),
      expected_month INTEGER NOT NULL,
      expected_year INTEGER NOT NULL,
      transaction_id TEXT REFERENCES transactions(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'unpaid', 'partial', 'pending')),
      notes TEXT
    );
  `);

  // Seed default categories
  const cats = [
    { id: 'cat_rent', name: 'Rent Payment', color: '#10B981', type: 'income' },
    { id: 'cat_utilities', name: 'Utilities', color: '#3B82F6', type: 'expense' },
    { id: 'cat_maintenance', name: 'Maintenance & Repairs', color: '#F59E0B', type: 'expense' },
    { id: 'cat_insurance', name: 'Insurance', color: '#8B5CF6', type: 'expense' },
    { id: 'cat_mortgage', name: 'Mortgage', color: '#EF4444', type: 'expense' },
    { id: 'cat_council_tax', name: 'Council Tax', color: '#EC4899', type: 'expense' },
    { id: 'cat_cleaning', name: 'Cleaning', color: '#14B8A6', type: 'expense' },
    { id: 'cat_agent_fees', name: 'Agent Fees', color: '#F97316', type: 'expense' },
    { id: 'cat_deposit', name: 'Deposit', color: '#6366F1', type: 'income' },
    { id: 'cat_other', name: 'Other', color: '#6B7280', type: 'expense' },
    { id: 'cat_transfer', name: 'Transfer', color: '#94A3B8', type: 'transfer' },
  ];

  const insertCat = db.prepare(
    `INSERT OR IGNORE INTO categories (id, name, color, type) VALUES (?, ?, ?, ?)`
  );
  for (const c of cats) {
    insertCat.run(c.id, c.name, c.color, c.type);
  }
}
