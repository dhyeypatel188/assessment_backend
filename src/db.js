const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id          SERIAL PRIMARY KEY,
      text        TEXT NOT NULL,
      language    VARCHAR(32) NOT NULL DEFAULT 'hi-en',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

const repo = {
  async list({ q, limit = 100, offset = 0 } = {}) {
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE text ILIKE $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT * FROM transcriptions ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  },

  async get(id) {
    const { rows } = await pool.query('SELECT * FROM transcriptions WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create({ text, language = 'hi-en' }) {
    const { rows } = await pool.query(
      'INSERT INTO transcriptions (text, language) VALUES ($1, $2) RETURNING *',
      [text, language]
    );
    return rows[0];
  },

  async update(id, { text, language }) {
    const { rows } = await pool.query(
      `UPDATE transcriptions
       SET text = COALESCE($2, text),
           language = COALESCE($3, language),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, text ?? null, language ?? null]
    );
    return rows[0] || null;
  },

  async remove(id) {
    const { rowCount } = await pool.query('DELETE FROM transcriptions WHERE id = $1', [id]);
    return rowCount > 0;
  },
};

module.exports = { pool, init, repo };
