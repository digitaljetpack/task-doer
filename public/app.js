const api = {
  async list(status='all') {
    const res = await fetch(`/api/tasks?status=${encodeURIComponent(status)}`);
    return res.json();
  },
  async create(data) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create');
    return res.json();
  },
  async update(id, data) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
    return res.json();
  },
  async remove(id) {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
    return res.json();
  }
};

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

Object.entries(filters).forEach(([key, btn]) => {
  btn.addEventListener('click', () => {
    currentFilter = key;
    Object.values(filters).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const notes = notesEl.value.trim();
  const commit_by = commitEl.value || null;
  if (!title) return;
  await api.create({ title, notes, commit_by });
  form.reset();
  titleEl.focus();
  render();
});

function taskCard(t) {
  const wrapper = document.createElement('div');
  wrapper.className = 'task';
  wrapper.dataset.id = t.id;

  const top = document.createElement('div');
  top.className = 'task-top';

  const left = document.createElement('div');
  left.className = 'task-left';

  // Keep the checkbox toggle, too
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!t.completed;
  checkbox.addEventListener('change', async () => {
    if (checkbox.checked) wrapper.classList.add('celebrate','completed');
    await api.update(t.id, { completed: checkbox.checked });
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

  const commit = document.createElement('input');
  commit.type = 'date';
  commit.value = t.commit_by || '';
  commit.title = 'Commitment date';
  commit.addEventListener('change', async () => {
    await api.update(t.id, { commit_by: commit.value || null });
    render();
  });

  // NEW: Mark Complete button with green glow celebration
  const completeBtn = document.createElement('button');
  completeBtn.textContent = t.completed ? 'Completed' : 'Mark Complete';
  completeBtn.className = 'success';
  if (t.completed) completeBtn.disabled = true;
  completeBtn.addEventListener('click', async () => {
    wrapper.classList.add('celebrate','completed');
    await api.update(t.id, { completed: true });
    render();
  });

  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.className = 'danger';
  del.addEventListener('click', async () => {
    if (confirm('Delete this task?')) {
      await api.remove(t.id);
      render();
    }
  });

  right.append(commit, completeBtn, del);

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
  notes.addEventListener('change', async () => {
    await api.update(t.id, { notes: notes.value });
    meta.textContent = `Created ${new Date(t.created_at).toLocaleString()} • Updated ${new Date().toLocaleString()} ${commit.value ? `• Commit by ${commit.value}` : ''}`;
  });

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
    empty.textContent = 'No tasks yet. Add one, then keep typing the next.';
    tasksEl.append(empty);
    return;
  }
  data.forEach(t => tasksEl.append(taskCard(t)));
}

render();
