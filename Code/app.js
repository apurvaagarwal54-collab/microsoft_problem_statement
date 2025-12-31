const API_BASE = '/api';
const toasts = document.getElementById('toasts');

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
      registration?.showNotification
        ? (await navigator.serviceWorker.ready).showNotification(title, { body, icon: '/assets/logo.svg' })
        : new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(title, { body });
      }
    }
  } catch {}
}

// Register service worker for notifications
let registration = null;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('Service worker registration failed');
    }
  });
}

const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(registerForm);
  const payload = Object.fromEntries(fd.entries());
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register');

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    showToast('success', 'Account created successfully!');
    notify('Account created', `Welcome, ${data.user.name}!`);
    setTimeout(() => window.location.href = '/dashboard.html', 600);
  } catch (err) {
    showToast('error', err.message);
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  const payload = Object.fromEntries(fd.entries());
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to login');

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    showToast('success', 'Login successful!');
    notify('Login successful', `Hello again, ${data.user.name}!`);
    setTimeout(() => window.location.href = '/dashboard.html', 600);
  } catch (err) {
    showToast('error', err.message);
  }
});