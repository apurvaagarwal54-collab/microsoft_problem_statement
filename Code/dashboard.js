const API_BASE = '/api';
const toasts = document.getElementById('toasts');
const tbody = document.getElementById('reminders-tbody');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout');
const reminderForm = document.getElementById('reminder-form');

function showToast(type, text) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function notify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, icon: '/assets/logo.svg' });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, { body, icon: '/assets/logo.svg' });
      }
    }
  } catch {}
}

function getToken() {
  return localStorage.getItem('token');
}

async function fetchMe() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return;
  }
  const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    window.location.href = '/';
    return;
  }
  const u = data.user;
  userInfo.textContent = `${u.name} — ${u.course}, ${u.college}`;
}

async function loadReminders() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reminders`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    showToast('error', data.error || 'Failed to load reminders');
    return;
  }
  tbody.innerHTML = '';
  data.reminders.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.title}</td>
      <td>${r.date}</td>
      <td>${r.time || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  window.location.href = '/';
});

reminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(reminderForm);
  const payload = Object.fromEntries(fd.entries());
  if (!payload.title || !payload.date) {
    showToast('error', 'Title and date are required');
    return;
  }
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create reminder');

    showToast('success', 'Reminder set!');
    notify('Reminder set', `${data.reminder.title} on ${data.reminder.date}${data.reminder.time ? ' at ' + data.reminder.time : ''}`);
    reminderForm.reset();
    loadReminders();
  } catch (err) {
    showToast('error', err.message);
  }
});

// Daily notifications loop (client-side)
// Nudges daily for reminders with date >= today
function startDailyNudges() {
  const ONE_HOUR = 60 * 60 * 1000;
  const token = getToken();

  async function nudge() {
    try {
      const res = await fetch(`${API_BASE}/reminders`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) return;

      const today = new Date().toISOString().slice(0, 10);
      const upcoming = data.reminders.filter(r => r.date >= today);
      if (upcoming.length > 0) {
        const count = upcoming.length;
        notify('Daily Reminder', `You have ${count} upcoming deadline${count > 1 ? 's' : ''}. Stay on it!`);
      }
    } catch {}
  }

  // Nudge on load, then hourly (you can change to 24h: 24 * ONE_HOUR)
  nudge();
  setInterval(nudge, ONE_HOUR);
}

(async function init() {
  // Service worker registration
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch {}
  }
  await fetchMe();
  await loadReminders();
  showToast('success', 'Logged in!');
  notify('Welcome back', 'Daily reminders are enabled while this tab is open.');
  startDailyNudges();
})();