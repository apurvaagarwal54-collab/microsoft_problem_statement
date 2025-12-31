// server.js
// 1) npm init -y
// 2) npm install express cors node-fetch
// 3) node server.js
// Open: http://localhost:4000

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 4000;

// In-memory storage
let tasks = [];
let completedTasks = [];

// ====== Microsoft Graph / Teams config (fill later for real integration) ======
const GRAPH_TENANT_ID = '';          // e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
const GRAPH_CLIENT_ID = '';
const GRAPH_CLIENT_SECRET = '';
const TEAMS_TEAM_ID = '';            // target Team ID for channel message
const TEAMS_CHANNEL_ID = '';         // target Channel ID

const TOKEN_URL = GRAPH_TENANT_ID
  ? `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`
  : '';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

// ====== Middleware ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== TASK APIs ======
app.get('/api/tasks', (req, res) => {
  tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  res.json(tasks);
});

app.get('/api/tasks/completed', (req, res) => {
  res.json(completedTasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, type, deadline, subject, description } = req.body;
  if (!title || !type || !deadline) {
    return res.status(400).json({ error: 'title, type and deadline are required' });
  }

  const task = {
    id: Date.now().toString(),
    title,
    type,
    deadline,
    subject: subject || '',
    description: description || ''
  };

  tasks.push(task);
  tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  res.status(201).json(task);
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });

  const task = tasks[idx];
  tasks.splice(idx, 1);
  completedTasks.push(task);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });

  const deleted = tasks.splice(idx, 1)[0];
  res.json(deleted);
});

// ====== Microsoft To Do demo hook (as before) ======
app.post('/api/todo', async (req, res) => {
  const { title, type, deadline, subject, description } = req.body;

  return res.json({
    status: 'demo',
    message: 'This is where Microsoft To Do Graph API would be called.',
    wouldSend: {
      title,
      body: {
        contentType: 'text',
        content: `Type: ${type}\nSubject: ${subject || ''}\nDeadline: ${deadline}\n\n${description || ''}`
      }
    }
  });
});

// ====== Microsoft Teams integration ======

// Helper to get Graph token (client credentials flow) – used for app-only calls. [web:16][web:31]
async function getGraphToken() {
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error('Graph credentials not configured');
  }

  const params = new URLSearchParams();
  params.append('client_id', GRAPH_CLIENT_ID);
  params.append('client_secret', GRAPH_CLIENT_SECRET);
  params.append('scope', GRAPH_SCOPE);
  params.append('grant_type', 'client_credentials');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    body: params
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data.access_token;
}

/*
Real Teams channel message call (user-delegated recommended for production):

POST https://graph.microsoft.com/v1.0/teams/{team-id}/channels/{channel-id}/messages
Body: { "body": { "contentType": "html", "content": "<b>text</b>" } }

Docs: send chatMessage in a channel [web:34][web:31]
*/

app.post('/api/teams', async (req, res) => {
  const { title, type, deadline, subject, description } = req.body;

  // In demo mode, do not fail if IDs are missing – just show what would be sent.
  if (!TEAMS_TEAM_ID || !TEAMS_CHANNEL_ID || !GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    return res.json({
      status: 'demo',
      message: 'Teams credentials not set. This shows what would be posted to Teams.',
      wouldSendTo: {
        teamId: 'YOUR_TEAM_ID_HERE',
        channelId: 'YOUR_CHANNEL_ID_HERE'
      },
      messageBody: {
        contentType: 'html',
        content: `
          <b>New task from DeadlineTracker</b><br/>
          <b>Title:</b> ${title}<br/>
          <b>Type:</b> ${type}<br/>
          <b>Subject:</b> ${subject || '-'}<br/>
          <b>Deadline:</b> ${deadline}<br/>
          <b>Description:</b> ${description || '-'}
        `
      }
    });
  }

  try {
    const accessToken = await getGraphToken();

    const url = `https://graph.microsoft.com/v1.0/teams/${TEAMS_TEAM_ID}/channels/${TEAMS_CHANNEL_ID}/messages`;

    const content = `
      <b>New task from DeadlineTracker</b><br/>
      <b>Title:</b> ${title}<br/>
      <b>Type:</b> ${type}<br/>
      <b>Subject:</b> ${subject || '-'}<br/>
      <b>Deadline:</b> ${deadline}<br/>
      <b>Description:</b> ${description || '-'}
    `;

    const graphRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: {
          contentType: 'html',
          content
        }
      })
    });

    if (!graphRes.ok) {
      const text = await graphRes.text();
      return res.status(500).json({ error: 'Failed to post to Teams', details: text });
    }

    const result = await graphRes.json();
    res.json({ status: 'sent', graphResultId: result.id || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error posting message to Teams', details: err.message });
  }
});

// ====== Static frontend ======
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DeadlineTracker app running at http://localhost:${PORT}`);
});