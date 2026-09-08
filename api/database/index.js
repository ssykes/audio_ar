const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => console.log('[DB] Connected to PostgreSQL'));
pool.on('error', (err) => console.error('[DB] Unexpected error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  queryOne: async (text, params) => {
    const result = await pool.query(text, params);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  },
  getClient: () => pool.connect()
};
