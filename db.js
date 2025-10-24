// db.js - SQLite setup with better-sqlite3 (sync, fast, zero-deps)
import Database from 'better-sqlite3';

const db = new Database('data.sqlite');
db.pragma('journal_mode = WAL');

// Create table if it doesn't exist (now includes label_color)
const createTableSQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  commit_by TEXT,             -- ISO date string (YYYY-MM-DD) or null
  created_at TEXT NOT NULL,   -- ISO timestamp
  updated_at TEXT NOT NULL,   -- ISO timestamp
  completed INTEGER NOT NULL DEFAULT 0,
  label_color TEXT            -- one of: sapphire, emerald, amber, orchid, slate
);
CREATE INDEX IF NOT EXISTS idx_tasks_commit_by ON tasks(commit_by);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
`;
createTableSQL.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => db.prepare(stmt).run());

// Lightweight migration for older DBs
try {
  const cols = db.prepare('PRAGMA table_info(tasks)').all();
  const names = new Set(cols.map(c => c.name));
  if (!names.has('label_color')) {
    db.prepare('ALTER TABLE tasks ADD COLUMN label_color TEXT').run();
  }
} catch (_) {
  // best-effort
}

export default db;
