const api = {
  async list(status='all') { return (await fetch(`/api/tasks?status=${encodeURIComponent(status)}`)).json(); },
  async create(data) {
    const res = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create'); return res.json();
  },
  async update(id, data) {
    const res = await fetch(`/api/tasks/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update'); return res.json();
  },
  async remove(id) {
    const res = await fetch(`/api/tasks/${id}`, { method:'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete'); return res.json();
  }
};

// Five premium colors with editable display names
const DEFAULT_PALETTE = [
  { key: 'sapphire', hex: '#3B82F6', name: 'Sapphire' },
  { key: 'emerald',  hex: '#10B981', name: 'Emerald'  },
  { key: 'amber',    hex: '#F59E0B', name: 'Amber'    },
  { key: 'orchid',   hex: '#A855F7', name: 'Orchid'   },
  { key: 'slate',    hex: '#64748B', name: 'Slate'    },
];

function loadPaletteNames() {
  try { return JSON.parse(localStorage.getItem('paletteNames')) || {}; } catch { return {}; }
}
function savePaletteNames(map) {
  localStorage.setItem('paletteNames', JSON.stringify(map));
}

const tasksEl = document.getElementById('tasks');
const form = document.getElementById('create-form');
const titleEl = document.getElementById('title');
const notesEl = document.getElementById('notes');
const commitEl = document.getElementById('commit_by');

const filters = {
  all: document.getElementById('filter-all'),
  active: document.getElementById('filter-active'),
  completed: document.getElementById('filter-completed')
};

let currentFilter = 'all';
let selectedColor = 'sapphire';
let paletteNames = loadPaletteNames(); // { key: customName }

Object.entries(filters).forEach(([key, btn]) => {
  btn.addEventListener('click', () => {
    currentFilter = key;
    Object.values(filters).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// Build left palette editor (dot + editable name)
const paletteEditor = document.getElementById('palette-editor');
if (paletteEditor) {
  DEFAULT_PALETTE.forEach(({ key, hex, name }) => {
    const row = document.createElement('div'); row.className = 'palette-row';
    const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'color-dot';
    dot.style.setProperty('--chip', hex);
    dot.title = (paletteNames[key] || name) + ' (select)';
    if (key === selectedColor) dot.classList.add('active');
    dot.addEventListener('click', () => {
      selectedColor = key;
      [...paletteEditor.querySelectorAll('.color-dot')].forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'color-name';
    input.value = paletteNames[key] || name;
    input.placeholder = name;
    input.addEventListener('input', () => {
      paletteNames[key] = input.value.trim() || name;
      savePaletteNames(paletteNames);
      // update titles on dots and any open selects
      dot.title = (paletteNames[key] || name) + ' (select)';
      document.querySelectorAll('select.color-select').forEach(sel => {
        [...sel.options].forEach(opt => {
          const def = DEFAULT_PALETTE.find(p => p.key === opt.value);
          opt.textContent = paletteNames[opt.value] || def.name;
        });
      });
    });

    row.append(dot, input);
    paletteEditor.append(row);
  });
}

// Auto-grow notes (no scrollbars)
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
notesEl.addEventListener('input', () => autoGrow(notesEl));
window.addEventListener('load', () => autoGrow(notesEl));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const notes = notesEl.value.trim();
  const commit_by = commitEl.value || null;
  if (!title) return;
  await api.create({ title, notes, commit_by, label_color: selectedColor });
  form.reset();
  autoGrow(notesEl);
  titleEl.focus();
  render();
});

function colorSelect(currentKey) {
  const sel = document.createElement('select');
  sel.className = 'color-select';
  DEFAULT_PALETTE.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = paletteNames[p.key] || p.name;
    if (p.key === (currentKey || selectedColor)) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

function taskCard(t) {
  const wrapper = document.createElement('div');
  wrapper.className = 'task';
  if (t.label_color) wrapper.setAttribute('data-color', t.label_color);

  const top = document.createElement('div');
  top.className = 'task-top';

  const left = document.createElement('div');
  left.className = 'task-left';

  // Checkbox stays
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!t.completed;
  checkbox.addEventListener('change', async () => {
    await api.update(t.id, { completed: checkbox.checked });
    if (checkbox.checked) wrapper.classList.add('celebrate', 'completed');
    else wrapper.classList.remove('completed');
    render();
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.value = t.title;
  title.className = 'title-input';
  title.addEventListener('change', async () => {
    await api.update(t.id, { title: title.value });
    render();
  });

  left.append(checkbox, title);

  const right = document.createElement('div');
  right.className = 'task-right';

  // Color selector (using editable names)
  const colorSel = colorSelect(t.label_color);
  colorSel.addEventListener('change', async () => {
    const val = colorSel.value;
    await api.update(t.id, { label_color: val });
    wrapper.setAttribute('data-color', val);
  });

  const commit = document.createElement('input');
  commit.type = 'date';
  commit.value = t.commit_by || '';
  commit.title = 'Commitment date';
  commit.addEventListener('change', async () => {
    await api.update(t.id, { commit_by: commit.value || null });
    render();
  });

  // RESTORED: Mark Complete button with green glow
  const completeBtn = document.createElement('button');
  completeBtn.textContent = t.completed ? 'Completed' : 'Mark Complete';
  completeBtn.className = 'success';
  if (t.completed) completeBtn.disabled = true;
  completeBtn.addEventListener('click', async () => {
    wrapper.classList.add('celebrate', 'completed');
    await api.update(t.id, { completed: true });
    render();
  });

  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.className = 'danger';
  del.addEventListener('click', async () => {
    if (confirm('Delete this task?')) { await api.remove(t.id); render(); }
  });

  right.append(colorSel, commit, completeBtn, del);
  top.append(left, right);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const created = new Date(t.created_at).toLocaleString();
  const updated = new Date(t.updated_at).toLocaleString();
  meta.textContent = `Created ${created} • Updated ${updated} ${t.commit_by ? `• Commit by ${t.commit_by}` : ''}`;

  const notes = document.createElement('textarea');
  notes.rows = 3;
  notes.placeholder = 'Notes…';
  notes.value = t.notes || '';
  notes.addEventListener('input', () => autoGrow(notes));
  notes.addEventListener('change', async () => {
    await api.update(t.id, { notes: notes.value });
    autoGrow(notes);
  });
  autoGrow(notes);

  wrapper.append(top, meta, notes);
  if (t.completed) wrapper.classList.add('completed');
  if (t.commit_by) {
    const today = new Date().toISOString().slice(0,10);
    if (!t.completed && t.commit_by < today) wrapper.classList.add('overdue');
  }
  return wrapper;
}

async function render() {
  const data = await api.list(currentFilter);
  tasksEl.innerHTML = '';
  if (!data.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No tasks yet.';
    tasksEl.append(empty);
  } else {
    data.forEach(t => tasksEl.append(taskCard(t)));
  }
}

render();
