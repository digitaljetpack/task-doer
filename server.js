// server.js - Express API + static frontend
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

function nowISO() { return new Date().toISOString(); }
function isValidDateStr(s) {
  if (!s) return true; // allow null/undefined
  // Expect YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// --- Data access helpers ---
const insertTask = db.prepare(`
  INSERT INTO tasks (title, notes, commit_by, created_at, updated_at, completed)
  VALUES (@title, @notes, @commit_by, @created_at, @updated_at, @completed)
`);

const selectTaskById = db.prepare('SELECT * FROM tasks WHERE id = ?');
const updateTask = db.prepare(`
  UPDATE tasks SET title=@title, notes=@notes, commit_by=@commit_by,
                   updated_at=@updated_at, completed=@completed
  WHERE id=@id
`);
const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');

// IMPORTANT: order by when it's needed
const listTasks = db.prepare(`
  SELECT * FROM tasks
  WHERE (@completed IS NULL OR completed = @completed)
  ORDER BY completed ASC,            -- active first
           commit_by IS NULL,        -- with a date before no-date
           commit_by ASC,            -- earliest needed first
           created_at ASC            -- then older first (stable)
`);

// --- Routes ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: nowISO() });
});

// List tasks: /api/tasks?status=all|active|completed
app.get('/api/tasks', (req, res) => {
  const status = (req.query.status || 'all').toString();
  let completed = null;
  if (status === 'active') completed = 0;
  if (status === 'completed') completed = 1;
  const rows = listTasks.all({ completed });
  res.json(rows);
});

// Get one task
app.get('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = selectTaskById.get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Create
app.post('/api/tasks', (req, res) => {
  const { title, notes = '', commit_by = null } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required (string)' });
  }
  if (!isValidDateStr(commit_by)) {
    return res.status(400).json({ error: 'commit_by must be YYYY-MM-DD or null' });
  }
  const timestamp = nowISO();
  const info = insertTask.run({
    title: title.trim(),
    notes: String(notes ?? ''),
    commit_by: commit_by || null,
    created_at: timestamp,
    updated_at: timestamp,
    completed: 0,
  });
  const row = selectTaskById.get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Update (partial allowed)
app.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectTaskById.get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let { title, notes, commit_by, completed } = req.body || {};

  if (title === undefined) title = existing.title;
  if (notes === undefined) notes = existing.notes;
  if (commit_by === undefined) commit_by = existing.commit_by;
  if (completed === undefined) completed = existing.completed;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required (string)' });
  }
  if (!isValidDateStr(commit_by)) {
    return res.status(400).json({ error: 'commit_by must be YYYY-MM-DD or null' });
  }
  const updated_at = nowISO();
  updateTask.run({ id, title: title.trim(), notes: String(notes ?? ''), commit_by: commit_by || null, completed: completed ? 1 : 0, updated_at });
  const row = selectTaskById.get(id);
  res.json(row);
});

// Delete
app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectTaskById.get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  deleteTask.run(id);
  res.json({ ok: true });
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Task Tracker listening on http://localhost:${PORT}`);
});
