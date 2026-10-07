const state = { mode: 'login', editingId: null, tasks: [] };

const $ = (selector) => document.querySelector(selector);
const authView = $('#auth-view');
const dashboardView = $('#dashboard-view');
const authForm = $('#auth-form');
const taskForm = $('#task-form');

function csrfToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : document.querySelector('meta[name="csrf-token"]').content;
}

function showMessage(element, message, type = 'error') {
  element.textContent = message;
  element.className = `message ${type}`;
}

function hideMessage(element) {
  element.textContent = '';
  element.className = 'message hidden';
}

function getErrorMessage(data) {
  if (data.error) return data.error;
  if (data.errors) {
    const firstField = Object.values(data.errors)[0];
    if (Array.isArray(firstField)) return firstField[0];
  }
  return 'Something went wrong. Please try again.';
}

async function request(url, options = {}) {
  const config = { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
  if (config.method && config.method !== 'GET') config.headers['X-CSRFToken'] = csrfToken();
  const response = await fetch(url, config);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data ? getErrorMessage(data) : 'Request failed.');
  return data;
}

function setAuthMode(mode) {
  state.mode = mode;
  const register = mode === 'register';
  $('#auth-title').textContent = register ? 'Create your account' : 'Sign in to Taskflow';
  $('#auth-subtitle').textContent = register ? 'A focused workspace for everything ahead.' : 'Your work, right where you left it.';
  $('#auth-submit-label').textContent = register ? 'Create account' : 'Sign in';
  $('#switch-copy').textContent = register ? 'Already have an account?' : 'New to Taskflow?';
  $('#switch-auth').textContent = register ? 'Sign in' : 'Create an account';
  $('#email-field').classList.toggle('hidden', !register);
  $('#email').required = register;
  $('#password').autocomplete = register ? 'new-password' : 'current-password';
  hideMessage($('#auth-message'));
}

function showDashboard(user) {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  $('#user-greeting').textContent = user.email || user.username;
  $('#hero-name').textContent = user.username;
  loadTasks();
}

function showAuth() {
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');
  authForm.reset();
  setAuthMode('login');
}

async function submitAuth(event) {
  event.preventDefault();
  const formData = new FormData(authForm);
  const payload = { username: formData.get('username'), password: formData.get('password') };
  if (state.mode === 'register') payload.email = formData.get('email');
  const submitButton = authForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  hideMessage($('#auth-message'));
  try {
    const data = await request(`/api/auth/${state.mode === 'register' ? 'register' : 'login'}/`, { method: 'POST', body: JSON.stringify(payload) });
    showDashboard(data.user);
  } catch (error) {
    showMessage($('#auth-message'), error.message);
  } finally {
    submitButton.disabled = false;
  }
}

function updateStats(tasks) {
  $('#stat-total').textContent = tasks.length;
  $('#stat-progress').textContent = tasks.filter((task) => task.status === 'progress').length;
  $('#stat-completed').textContent = tasks.filter((task) => task.status === 'completed').length;
  $('#stat-high').textContent = tasks.filter((task) => task.priority === 'high').length;
  $('#task-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
}

function formatDate(dateValue) {
  if (!dateValue) return 'No due date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${dateValue}T00:00:00`));
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  const main = document.createElement('div');
  main.className = 'task-main';
  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title;
  const description = document.createElement('p');
  description.className = 'task-description';
  description.textContent = task.description || 'No description added';
  main.append(title, description);
  const status = document.createElement('span');
  status.className = `task-pill pill-${task.status}`;
  status.textContent = task.status_label;
  const priority = document.createElement('span');
  priority.className = `task-pill pill-${task.priority}`;
  priority.textContent = task.priority_label;
  const date = document.createElement('time');
  date.className = 'task-date';
  date.textContent = formatDate(task.due_date);
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  const editButton = document.createElement('button');
  editButton.className = 'icon-button';
  editButton.setAttribute('aria-label', `Edit ${task.title}`);
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => openTaskModal(task));
  const deleteButton = document.createElement('button');
  deleteButton.className = 'icon-button';
  deleteButton.setAttribute('aria-label', `Delete ${task.title}`);
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deleteTask(task));
  actions.append(editButton, deleteButton);
  card.append(main, status, priority, date, actions);
  return card;
}

function renderTasks(tasks) {
  const list = $('#task-list');
  list.replaceChildren();
  tasks.forEach((task) => list.appendChild(createTaskCard(task)));
  const hasFilters = Boolean($('#search-input').value || $('#status-filter').value || $('#priority-filter').value);
  $('#clear-filters').classList.toggle('hidden', !hasFilters);
  $('#empty-state').classList.toggle('hidden', tasks.length !== 0);
  $('#task-list').classList.toggle('hidden', tasks.length === 0);
  $('#empty-title').textContent = hasFilters ? 'No matching tasks' : 'Nothing here yet';
  $('#empty-copy').textContent = hasFilters ? 'Try a different search or clear your filters.' : 'Create your first task and give your day a clear next step.';
  $('#empty-action').textContent = hasFilters ? 'Clear filters' : 'Create a task';
  updateStats(state.tasks);
}

async function loadTasks() {
  const params = new URLSearchParams();
  const search = $('#search-input').value.trim();
  if (search) params.set('search', search);
  if ($('#status-filter').value) params.set('status', $('#status-filter').value);
  if ($('#priority-filter').value) params.set('priority', $('#priority-filter').value);
  try {
    const tasks = await request(`/api/tasks/?${params.toString()}`);
    const allTasks = await request('/api/tasks/');
    state.tasks = allTasks;
    renderTasks(tasks);
    hideMessage($('#task-message'));
  } catch (error) {
    showMessage($('#task-message'), error.message);
  }
}

function openTaskModal(task = null) {
  state.editingId = task ? task.id : null;
  $('#modal-eyebrow').textContent = task ? 'Edit task' : 'New task';
  $('#modal-title').textContent = task ? 'Update your task' : 'Create a task';
  $('#task-submit-label').textContent = task ? 'Save changes' : 'Create task';
  $('#task-title').value = task ? task.title : '';
  $('#task-description').value = task ? task.description : '';
  $('#task-status').value = task ? task.status : 'todo';
  $('#task-priority').value = task ? task.priority : 'medium';
  $('#task-due-date').value = task ? (task.due_date || '') : '';
  hideMessage($('#modal-message'));
  $('#task-modal').classList.remove('hidden');
  $('#task-title').focus();
}

function closeTaskModal() {
  $('#task-modal').classList.add('hidden');
  state.editingId = null;
}

async function submitTask(event) {
  event.preventDefault();
  const payload = { title: $('#task-title').value, description: $('#task-description').value, status: $('#task-status').value, priority: $('#task-priority').value, due_date: $('#task-due-date').value || null };
  const url = state.editingId ? `/api/tasks/${state.editingId}/` : '/api/tasks/';
  const submitButton = taskForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await request(url, { method: state.editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    closeTaskModal();
    await loadTasks();
  } catch (error) {
    showMessage($('#modal-message'), error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteTask(task) {
  if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
  try {
    await request(`/api/tasks/${task.id}/`, { method: 'DELETE' });
    await loadTasks();
  } catch (error) {
    showMessage($('#task-message'), error.message);
  }
}

async function checkSession() {
  try {
    const data = await request('/api/auth/me/');
    if (data.authenticated) showDashboard(data.user);
    else showAuth();
  } catch (error) {
    showAuth();
  }
}

$('#switch-auth').addEventListener('click', () => setAuthMode(state.mode === 'login' ? 'register' : 'login'));
$('#toggle-password').addEventListener('click', (event) => {
  const password = $('#password');
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
});
authForm.addEventListener('submit', submitAuth);
$('#logout-button').addEventListener('click', async () => { await request('/api/auth/logout/', { method: 'POST' }); showAuth(); });
$('#new-task-button').addEventListener('click', () => openTaskModal());
$('#empty-action').addEventListener('click', () => { if ($('#search-input').value || $('#status-filter').value || $('#priority-filter').value) { $('#search-input').value = ''; $('#status-filter').value = ''; $('#priority-filter').value = ''; loadTasks(); } else openTaskModal(); });
$('#clear-filters').addEventListener('click', () => { $('#search-input').value = ''; $('#status-filter').value = ''; $('#priority-filter').value = ''; loadTasks(); });
$('#search-input').addEventListener('input', loadTasks);
$('#status-filter').addEventListener('change', loadTasks);
$('#priority-filter').addEventListener('change', loadTasks);
$('#close-modal').addEventListener('click', closeTaskModal);
$('#cancel-modal').addEventListener('click', closeTaskModal);
$('#task-modal').addEventListener('click', (event) => { if (event.target === $('#task-modal')) closeTaskModal(); });
taskForm.addEventListener('submit', submitTask);
checkSession();
