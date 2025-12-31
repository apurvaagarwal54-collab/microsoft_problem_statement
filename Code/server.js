const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');
const cron = require('node-cron');

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// LowDB setup
const usersAdapter = new JSONFile(path.join(__dirname, 'db', 'users.json'));
const usersDB = new Low(usersAdapter, { users: [] });

const remindersAdapter = new JSONFile(path.join(__dirname, 'db', 'reminders.json'));
const remindersDB = new Low(remindersAdapter, { reminders: [] });

async function initDBs() {
  await usersDB.read();
  usersDB.data ||= { users: [] };
  await usersDB.write();

  await remindersDB.read();
  remindersDB.data ||= { reminders: [] };
  await remindersDB.write();
}
initDBs();

// Helpers
function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Missing authorization' });
  const token = header.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Routes
app.post('/api/auth/register', async (req, res) => {
  const { name, course, college, email, password } = req.body;
  if (!name || !course || !college || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  await usersDB.read();
  const exists = usersDB.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email already registered.' });

  const user = {
    id: nanoid(),
    name,
    course,
    college,
    email,
    // Simple local-only hash substitute (not secure, demo only)
    password: Buffer.from(password).toString('base64'),
    createdAt: new Date().toISOString()
  };
  usersDB.data.users.push(user);
  await usersDB.write();

  const token = createToken(user);
  res.json({ message: 'Account created successfully.', token, user: { id: user.id, name, course, college, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  await usersDB.read();
  const user = usersDB.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const pw = Buffer.from(password).toString('base64');
  if (pw !== user.password) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = createToken(user);
  res.json({ message: 'Login successful.', token, user: { id: user.id, name: user.name, course: user.course, college: user.college, email: user.email } });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  await usersDB.read();
  const user = usersDB.data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { id: user.id, name: user.name, course: user.course, college: user.college, email: user.email } });
});

app.post('/api/reminders', authMiddleware, async (req, res) => {
  const { title, date, time } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date are required.' });

  await remindersDB.read();
  const reminder = {
    id: nanoid(),
    userId: req.user.id,
    title,
    date, // yyyy-mm-dd
    time: time || null, // hh:mm
    createdAt: new Date().toISOString(),
    notifiedDays: [] // dates when daily notification sent
  };
  remindersDB.data.reminders.push(reminder);
  await remindersDB.write();

  res.json({ message: 'Reminder set successfully.', reminder });
});

app.get('/api/reminders', authMiddleware, async (req, res) => {
  await remindersDB.read();
  const list = remindersDB.data.reminders
    .filter(r => r.userId === req.user.id)
    .sort((a, b) => (a.date + (a.time || '')) > (b.date + (b.time || '')) ? 1 : -1);
  res.json({ reminders: list });
});

// Daily checker (server-side marker; client shows notifications)
cron.schedule('*/15 * * * *', async () => {
  // Every 15 minutes, mark today's reminders as notified (for that day)
  await remindersDB.read();
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10); // yyyy-mm-dd
  for (const r of remindersDB.data.reminders) {
    // Mark if today is <= reminder date (keep nudging daily until deadline)
    if (isoDate <= r.date && !r.notifiedDays.includes(isoDate)) {
      r.notifiedDays.push(isoDate);
    }
  }
  await remindersDB.write();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));