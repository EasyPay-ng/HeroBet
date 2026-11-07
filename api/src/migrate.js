import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

try {
  const sql = await readFile(new URL('../migrations/001_shared_rounds.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.info('Database migration 001_shared_rounds.sql applied.');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
