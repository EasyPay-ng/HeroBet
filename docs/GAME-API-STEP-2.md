# Game API — Step 2: connect the game screen to shared state

When `GET /api/game/state` succeeds, `web/src/game.js` now uses its round id, phase, multiplier, and server timing to render the shared practice flight. It polls every 600 ms through the same-origin `/api` path; Vite proxies that path to the standalone API in local development. Completed round history is loaded from `GET /api/game/rounds`.

If the first API request fails, the page clearly labels its existing browser-only practice simulation as **LOCAL PRACTICE · NOT SHARED**. If the API drops after a shared round has loaded, the page holds its last state, shows a reconnecting indicator, and keeps shared-mode controls locked instead of silently switching to a different flight.

The bet inputs, reset button, cashout, auto-bet and O/U actions are disabled in shared mode. This is intentional: the API currently has no bet/cashout endpoints, and local client settlement must not masquerade as a shared wager. The displayed demo balance and bet history remain separate account data.

## Verify once the API is running

1. Start the standalone services from `api/` using `docker compose up --build`.
2. Start Vite from `web/` with `npm run dev`.
3. Open `/game.html` in two separate browsers. Both should show the same `GLOBAL ROUND` id, phase, multiplier, and round history.
4. Stop the API and reload one client. It should label its flight `LOCAL PRACTICE · NOT SHARED`; do not compare that fallback flight with the other browser.

The API is still read-only. The next backend phase is authenticated, transactional demo betting with server-side cutoffs, cashout decisions, settlement, and idempotency. It must be tested before any wallet or real-money integration.
