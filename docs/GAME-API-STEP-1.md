# Game API — Step 1: shared round service

The API is deliberately limited to public round state. It does not accept bets, read/write wallets, or issue rewards. The game screen now reads this API when it is available and shows a clearly labeled local practice fallback when it is not. Bet controls are locked while viewing shared rounds until server-side bet endpoints exist.

## Stack

- Node.js 22 + Fastify HTTP API (`api/src/server.js`)
- PostgreSQL as the persistent source for shared round timestamps/results
- Separate persistent round-worker process (`api/src/round-worker.js`)
- Docker Compose for local PostgreSQL, migrations, API, and worker
- Firebase Auth/Firestore remain as-is for now; no Firebase Cloud Functions are used

The worker holds a PostgreSQL advisory lock so only one worker creates rounds. It creates rounds on server time and backfills elapsed rounds after a process restart. Every client reads the same round row. The crash outcome is committed with SHA-256 before play, revealed after the crash, and the seed is revealed when the round closes. This is a practice-game foundation, not an independently audited fairness system.

## Run locally

Requires Docker Compose with the Compose plugin. From the `api` directory:

```sh
docker compose up --build
```

Then check:

```sh
curl http://localhost:3001/api/health
curl http://localhost:3001/api/game/state
curl 'http://localhost:3001/api/game/rounds?limit=10'
```

Vite proxies browser requests made to `/api` to the local API at port 3001. Set `ALLOWED_ORIGINS` to comma-separated browser origins when exposing the API directly. Do not expose the PostgreSQL port publicly in deployment.

## API contract in this step

- `GET /api/health` — API and database liveness
- `GET /api/game/state` — current public round, server timestamp, phase, and live multiplier
- `GET /api/game/rounds?limit=20` — recent closed rounds with revealed seed and result

There are intentionally no `POST` bet, cashout, wallet, payout, loyalty, or referral endpoints in this step. The next step is to connect the game screen to this shared state and verify that multiple browser sessions display the same round. Bet endpoints and server settlement come after that, with an append-only transactional ledger and replay/idempotency tests.

## Deployment

The API and worker need an always-on Docker-capable host and a persistent managed PostgreSQL database. Deploy API and worker as separate processes/containers, configure `DATABASE_URL`, `ALLOWED_ORIGINS`, and `PORT`, run migrations before starting either process, and restrict database network access. Do not use a serverless host that suspends the worker if rounds must continue while users are offline.
