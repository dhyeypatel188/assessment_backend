const express = require('express');
const { repo } = require('./db');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
}

// READ (list + search)
router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const rows = await repo.list({ q: req.query.q, limit, offset });
  res.json(rows);
}));

// READ (one)
router.get('/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const row = await repo.get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

// CREATE (manual entry; live sessions are saved by the websocket handler)
router.post('/', wrap(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const row = await repo.create({ text, language: req.body.language });
  res.status(201).json(row);
}));

// UPDATE
router.put('/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const text = req.body.text === undefined ? undefined : String(req.body.text).trim();
  if (text === '') return res.status(400).json({ error: 'text cannot be empty' });
  const row = await repo.update(id, { text, language: req.body.language });
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

// DELETE
router.delete('/:id', wrap(async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const ok = await repo.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}));

module.exports = router;
