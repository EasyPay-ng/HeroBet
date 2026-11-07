import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool, fromRow } from './db.js';
import { publicRound } from './rounds.js';

const app = Fastify({ logger: true, trustProxy: true });
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean);

await app.register(cors, {
  origin: origins,
  methods: ['GET', 'OPTIONS'],
});

app.get('/api/health', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', service: 'herobet-game-api', database: 'connected' };
  } catch (error) {
    app.log.error(error, 'Database health check failed');
    return reply.code(503).send({ status: 'unavailable', service: 'herobet-game-api' });
  }
});

app.get('/api/game/state', async (_request, reply) => {
  const now = Date.now();
  const result = await pool.query(
    `SELECT id, starts_at, betting_closes_at, crash_at, ends_at,
            crash_multiplier, seed, commitment
       FROM game_rounds
      WHERE starts_at <= $1
      ORDER BY starts_at DESC
      LIMIT 1`,
    [new Date(now)],
  );
  if (!result.rowCount) {
    return reply.code(503).send({ error: 'ROUND_SERVICE_STARTING', message: 'The shared practice round service is starting.' });
  }
  return { serverTime: now, round: publicRound(fromRow(result.rows[0]), now) };
});

app.get('/api/game/rounds', async (request, reply) => {
  const requested = Number.parseInt(request.query?.limit, 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 100)) : 20;
  const result = await pool.query(
    `SELECT id, starts_at, betting_closes_at, crash_at, ends_at,
            crash_multiplier, seed, commitment
       FROM game_rounds
      WHERE ends_at <= now()
      ORDER BY starts_at DESC
      LIMIT $1`,
    [limit],
  );
  const now = Date.now();
  return { serverTime: now, rounds: result.rows.map(row => publicRound(fromRow(row), now)) };
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'The game API could not complete this request.' });
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}

async function shutdown(signal) {
  app.log.info(`Received ${signal}; shutting down API.`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
