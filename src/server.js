require('dotenv').config();
const http = require('http');
const express = require('express');
const { init } = require('./db');
const routes = require('./routes');
const { attachLiveTranscription } = require('./live');

const app = express();

// CORS: frontend is hosted separately. CORS_ORIGIN = comma-separated list, or "*" (default).
// Trailing slashes are stripped because browsers send Origin without one.
const allowed = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.json({ service: 'speech-to-text-backend', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/transcriptions', routes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
attachLiveTranscription(server);

const port = process.env.PORT || 3000;

init()
  .then(() => server.listen(port, () => console.log(`Backend running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Failed to initialise database:', err.message);
    process.exit(1);
  });
