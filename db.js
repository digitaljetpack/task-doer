// db.js - SQLite setup with better-sqlite3 (sync, fast, zero-deps)
 import Database from 'better-sqlite3';
 const db = new Database('data.sqlite');
 db.pragma('journal_mode = WAL');
 // Create table if it doesn't exist
 const createTableSQL = `
 CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  commit_by TEXT,             -- ISO date string (YYYY-MM-DD) or null
  created_at TEXT NOT NULL,   -- ISO timestamp
  updated_at TEXT NOT NULL,   -- ISO timestamp
  completed INTEGER NOT NULL DEFAULT 0
 );
 CREATE INDEX IF NOT EXISTS idx_tasks_commit_by ON tasks(commit_by);
 CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
 `;
 2
// Run multiple statements
 createTableSQL.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt =>
 db.prepare(stmt).run());
 export default db;