import { pool } from './db.js';
import { createRoundSchedule } from './rounds.js';

const POLL_MS = Number(process.env.ROUND_WORKER_POLL_MS || 500);
const ADVISORY_LOCK_ID = 7_214_222_031;
let stopped = false;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function insertNextRound(client, startsAt) {
  const schedule = createRoundSchedule(startsAt);
  const result = await client.query(
    `INSERT INTO game_rounds
      (starts_at, betting_closes_at, crash_at, ends_at, crash_multiplier, seed, commitment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (starts_at) DO NOTHING
     RETURNING id`,
    [new Date(schedule.startsAt), new Date(schedule.bettingClosesAt), new Date(schedule.crashAt),
      new Date(schedule.endsAt), schedule.crashMultiplier, schedule.seed, schedule.commitment],
  );
  if (result.rowCount) console.info(`Created shared practice round ${result.rows[0].id}`);
}

async function catchUpRounds(client, now = Date.now()) {
  let latest = await client.query('SELECT ends_at FROM game_rounds ORDER BY starts_at DESC LIMIT 1');
  let count = 0;
  while (!stopped && count < 2_000) {
    const startAt = latest.rowCount ? new Date(latest.rows[0].ends_at).getTime() : now;
    if (latest.rowCount && startAt > now) break;
    await insertNextRound(client, startAt);
    latest = await client.query('SELECT ends_at FROM game_rounds ORDER BY starts_at DESC LIMIT 1');
    count++;
  }
  if (count === 2_000) console.error('Round recovery capped at 2,000 rounds; inspect downtime and worker logs.');
}

async function run() {
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lock = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_ID]);
    locked = lock.rows[0].locked;
    if (!locked) {
      console.error('Another shared-round worker holds the PostgreSQL advisory lock. Exiting this worker.');
      process.exitCode = 1;
      return;
    }
    console.info('Shared-round worker started.');
    while (!stopped) {
      try {
        await catchUpRounds(lockClient);
      } catch (error) {
        console.error('Round worker tick failed:', error);
      }
      await pause(POLL_MS);
    }
  } finally {
    if (locked) await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => {});
    lockClient.release();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopped = true; });
}

run().catch(error => {
  console.error('Round worker failed:', error);
  process.exitCode = 1;
}).finally(() => pool.end());
