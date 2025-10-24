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
function isValidDateStr(s) { return !s || /^\d{4}-\d{2}-\d{2}$/.test(s); }

const ALLOWED_COLORS = new Set(['sapphire','emerald','amber','orchid','slate']);
function sanitizeColor(c) {
  if (!c) return null;
  const k = String(c).toLowerCase();
  return ALLOWED_COLORS.has(k) ? k : null;
}

// --- Data access helpers ---
const insertTask = db.prepare(`
  INSERT INTO tasks (title, notes, commit_by, created_at, updated_at, completed, label_color)
  VALUES (@title, @notes, @commit_by, @created_at, @updated_at, @completed, @label_color)
`);
const selectTaskById = db.prepare('SELECT * FROM tasks WHERE id = ?');
const updateTask = db.prepare(`
  UPDATE tasks SET title=@title, notes=@notes, commit_by=@commit_by,
                   updated_at=@updated_at, completed=@completed, label_color=@label_color
  WHERE id=@id
`);
const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');

const listTasks = db.prepare(`
  SELECT * FROM tasks
  WHERE (@completed IS NULL OR completed = @completed)
  ORDER BY completed ASC, commit_by IS NULL, commit_by ASC, created_at DESC
`);

// --- Routes ---
app.get('/api/health', (_req, res) => res.json({ ok: true, time: nowISO() }));

// List tasks: /api/tasks?status=all|active|completed
app.get('/api/tasks', (req, res) => {
  const status = String(req.query.status || 'all');
  let completed = null;
  if (status === 'active') completed = 0;
  if (status === 'completed') completed = 1;
  res.json(listTasks.all({ completed }));
});

// Get one
app.get('/api/tasks/:id', (req, res) => {
  const row = selectTaskById.get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Create
app.post('/api/tasks', (req, res) => {
  const { title, notes = '', commit_by = null, label_color = null } = req.body || {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required (string)' });
  if (!isValidDateStr(commit_by)) return res.status(400).json({ error: 'commit_by must be YYYY-MM-DD or null' });
  const timestamp = nowISO();
  const info = insertTask.run({
    title: title.trim(),
    notes: String(notes ?? ''),
    commit_by: commit_by || null,
    created_at: timestamp,
    updated_at: timestamp,
    completed: 0,
    label_color: sanitizeColor(label_color)
  });
  res.status(201).json(selectTaskById.get(info.lastInsertRowid));
});

// Update (partial allowed)
app.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectTaskById.get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let { title, notes, commit_by, completed, label_color } = req.body || {};
  if (title === undefined) title = existing.title;
  if (notes === undefined) notes = existing.notes;
  if (commit_by === undefined) commit_by = existing.commit_by;
  if (completed === undefined) completed = existing.completed;
  if (label_color === undefined) label_color = existing.label_color;

  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required (string)' });
  if (!isValidDateStr(commit_by)) return res.status(400).json({ error: 'commit_by must be YYYY-MM-DD or null' });

  updateTask.run({
    id,
    title: title.trim(),
    notes: String(notes ?? ''),
    commit_by: commit_by || null,
    completed: completed ? 1 : 0,
    label_color: sanitizeColor(label_color),
    updated_at: nowISO()
  });
  res.json(selectTaskById.get(id));
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
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Task Tracker listening on http://localhost:${PORT}`));
