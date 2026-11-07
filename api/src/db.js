import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', error => console.error('Unexpected PostgreSQL pool error', error));

export function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    startsAt: row.starts_at,
    bettingClosesAt: row.betting_closes_at,
    crashAt: row.crash_at,
    endsAt: row.ends_at,
    crashMultiplier: row.crash_multiplier,
    seed: row.seed,
    commitment: row.commitment,
  };
}
