let applications = [];
let activeFilter = 'All';
let authMode = 'register';
let editingId = null;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};
function prettyDate(date) { return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function render() {
  const visible = activeFilter === 'All' ? applications : applications.filter(item => item.status === activeFilter);
  $('#application-list').innerHTML = visible.map(item => `<tr><td><span class="company">${escapeHtml(item.company)}</span><span class="role">${escapeHtml(item.role)}</span></td><td><span class="badge ${item.status}">${item.status}</span><button class="edit" title="Edit application" data-edit-id="${item.id}">Edit</button></td><td>${prettyDate(item.date)}</td><td>${escapeHtml(item.nextStep || '—')}</td><td><button class="delete" title="Delete application" data-id="${item.id}">×</button></td></tr>`).join('');
  $('#empty-state').hidden = visible.length !== 0;
  const interviews = applications.filter(item => item.status === 'Interview').length;
  const active = applications.filter(item => ['Applied', 'Interview'].includes(item.status)).length;
  const responses = applications.filter(item => ['Interview', 'Offer'].includes(item.status)).length;
  $('#total-count').textContent = applications.length;
  $('#progress-count').textContent = active;
  $('#interview-count').textContent = interviews;
  $('#response-rate').textContent = applications.length ? `${Math.round((responses / applications.length) * 100)}%` : '0%';
  $('#goal-progress').textContent = `${applications.length} of 30`;
  $('#goal-bar').style.width = `${Math.min((applications.length / 30) * 100, 100)}%`;
}
async function loadApplications() { applications = (await api('/api/applications')).applications; render(); }
function renderTasks(tasks) { $('#task-list').innerHTML = tasks.length ? tasks.map(task => `<article class="task ${task.completed ? 'done' : ''}"><button class="task-check" data-task-id="${task.id}" data-completed="${task.completed ? '0' : '1'}">${task.completed ? '✓' : ''}</button><div><strong>${escapeHtml(task.title)}</strong><span>${task.dueDate ? `Due ${prettyDate(task.dueDate)}` : 'No due date'}</span></div><button class="task-delete" data-task-delete="${task.id}" title="Delete task">×</button></article>`).join('') : '<p class="task-empty">No actions yet. Add a follow-up, coding test, or interview task.</p>'; }
async function loadTasks() { renderTasks((await api('/api/tasks')).tasks); }
function configureAuth(mode) {
  authMode = mode; const registering = mode === 'register';
  $('#auth-title').textContent = registering ? 'Create your account' : 'Welcome back';
  $('#auth-copy').textContent = registering ? 'Start organizing your job search in one focused place.' : 'Log in to continue tracking your opportunities.';
  $('#name-field').hidden = !registering; $('#name-field input').required = registering;
  $('#auth-submit').textContent = registering ? 'Create account' : 'Log in';
  $('#auth-switch').textContent = registering ? 'Already have an account? Log in' : 'New to Trackly? Create an account'; $('#auth-error').textContent = '';
}
async function boot() { try { const { user } = await api('/api/me'); $('#user-name').textContent = `Hi, ${user.name.split(' ')[0]}`; $('#user-name').hidden = false; $('#logout-button').hidden = false; await loadApplications(); await loadTasks(); } catch { configureAuth('login'); $('#auth-modal').showModal(); } }
function openApplicationForm(application = null) { editingId = application?.id || null; $('#application-form').reset(); $('#application-form').company.value = application?.company || ''; $('#application-form').role.value = application?.role || ''; $('#application-form').status.value = application?.status || 'Applied'; $('#application-form').date.value = application?.date || new Date().toISOString().slice(0, 10); $('#application-form').nextStep.value = application?.nextStep || ''; $('#application-submit').textContent = application ? 'Save changes' : 'Save application'; $('.modal-heading h2').textContent = application ? 'Edit application' : 'Add an application'; $('#application-modal').showModal(); }
$('#open-modal').onclick = () => openApplicationForm();
$('#close-modal').onclick = () => $('#application-modal').close();
$('#open-task-modal').onclick = () => { $('#task-form').reset(); $('#task-modal').showModal(); };
$('#close-task-modal').onclick = () => $('#task-modal').close();
$('#auth-switch').onclick = () => configureAuth(authMode === 'register' ? 'login' : 'register');
$('#auth-form').onsubmit = async event => { event.preventDefault(); $('#auth-error').textContent = ''; const data = Object.fromEntries(new FormData(event.target)); try { const result = await api(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(data) }); $('#user-name').textContent = `Hi, ${result.user.name.split(' ')[0]}`; $('#user-name').hidden = false; $('#logout-button').hidden = false; $('#auth-modal').close(); await loadApplications(); } catch (error) { $('#auth-error').textContent = error.message; } };
$('#application-form').onsubmit = async event => { event.preventDefault(); try { await api(editingId ? `/api/applications/${editingId}` : '/api/applications', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); $('#application-modal').close(); await loadApplications(); } catch (error) { alert(error.message); } };
$('#application-list').onclick = async event => { const editId = event.target.dataset.editId; const id = event.target.dataset.id; if (editId) return openApplicationForm(applications.find(item => item.id === Number(editId))); if (id && confirm('Delete this application?')) { await api(`/api/applications/${id}`, { method: 'DELETE' }); await loadApplications(); } };
$('#task-form').onsubmit = async event => { event.preventDefault(); try { await api('/api/tasks', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); $('#task-modal').close(); await loadTasks(); } catch (error) { alert(error.message); } };
$('#task-list').onclick = async event => { const id = event.target.dataset.taskId; const deleteId = event.target.dataset.taskDelete; if (id) { await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed: event.target.dataset.completed === '1' }) }); await loadTasks(); } if (deleteId) { await api(`/api/tasks/${deleteId}`, { method: 'DELETE' }); await loadTasks(); } };
$('#logout-button').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); applications = []; render(); $('#user-name').hidden = true; $('#logout-button').hidden = true; configureAuth('login'); $('#auth-modal').showModal(); };
document.querySelectorAll('.filter').forEach(button => button.onclick = () => { activeFilter = button.dataset.filter; document.querySelector('.filter.active').classList.remove('active'); button.classList.add('active'); render(); });
boot();
