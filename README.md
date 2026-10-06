# HeroBet Markets

A **paper-trading terminal built on real market data**. Crypto, US equities and
forex — live prices, a real order book, limit and stop orders, short selling and
a marked-to-market portfolio — with simulated capital.

Nothing here is a simulation *of prices*. Every number on the screen comes from
a live public market-data API in your browser. The only thing that's fake is the
money: HeroBet takes no deposits, holds no client funds and is not a broker.

```
$100,000 paper capital  ·  62 real markets  ·  0 real naira at risk
```

---

## What's in the box

| Screen | Route | What it does |
|---|---|---|
| **Desk** | `#/dashboard` | Equity, P&L, buying power, watchlist, top movers, live trade tape, leaderboard, feed health |
| **Markets** | `#/markets` | All 62 instruments with live price, 24h change, 24h range and volume; search, sort, star |
| **Terminal** | `#/trade/BTC-USD` | Candlestick chart, order ticket (market/limit/stop, buy/short), order book, market tape, position panel |
| **Portfolio** | `#/portfolio` | Open positions marked to market, allocation, unrealised vs realised P&L |
| **Orders** | `#/orders` | Resting orders with live distance-to-trigger, full order history, executions blotter |
| **Cash** | `#/wallet` | Balances (with a live NGN equivalent), paper top-ups, append-only ledger |
| **Settings** | `#/settings` | Market-data vendor keys, venue probe diagnostics, account reset |
| **How it works** | `#/about` | Execution rules, data sources, production checklist |

Routes are hash routes, so the whole thing is one static bundle — no server
needed. `dashboard.html` and `markets.html` are friendly redirects into the SPA,
and `404.html` bounces unknown paths back into it on GitHub Pages.

## Where the prices come from

| Asset class | Source | Key needed? | Latency |
|---|---|---|---|
| **Crypto** (26 pairs) | Binance → Bybit → OKX → Coinbase → CoinGecko | No | Live websocket ticks |
| **Stocks** (20 US names) | Twelve Data / Finnhub / Alpha Vantage | Yes — free tier | 15s polling |
| **Forex** (15 pairs incl. NGN) | open.er-api.com, currency-api, ECB/Frankfurter | No | Official daily rate |

Crypto venues are **probed in parallel at boot and ranked by response time**, then
the app streams from the fastest one that answered. If a venue stops responding
mid-session it fails over automatically. This matters: several exchange domains
are blocked by ISPs in some countries (Binance in Nigeria, for instance), and the
terminal has to keep working anyway.

If no stock vendor key is connected, the stock rows stay **locked** — the app
will not show you an invented price. Paste a free key in
**Settings → Market data** and they go live instantly, no rebuild.

See [`docs/MARKET-DATA.md`](docs/MARKET-DATA.md) for the full provider matrix.

## How execution works

- **Market** orders fill immediately at the venue's live best bid/offer.
- **Limit** orders rest until the real market trades through your price, then
  fill at your limit (price improvement goes to you).
- **Stop** orders become market orders when the trigger prints.
- **Fees**: 0.10% crypto, 0.01% FX, commission-free stocks — charged per fill.
- **Shorting**: allowed at 100% initial margin, so a $1,000 short ties up the
  same buying power as a $1,000 purchase. No leverage, no liquidation engine.

Cash and positions only ever move inside a single Firestore transaction that
also writes a fill and a ledger entry, so the books always balance. The
accounting lives in `web/src/engine/paper.js` and is covered by 49 unit tests.

## Run locally

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # static bundle -> web/dist
npm test             # engine maths + headless page/backend tests
```

### Tests

| Command | What it checks |
|---|---|
| `npm run test:engine` | 49 assertions on fills, averaging, shorting, margin, buying power, P&L, order triggers |
| `npm run test:pages` | Boots every page in jsdom with the network hard-blocked: mount/destroy, the localStorage fallback backend, and a full order → fill → position → ledger round trip |

`test:pages` needs jsdom, which isn't a committed dependency (it's only for the
harness): `npm i --no-save jsdom` first.

## Firebase

The app is wired to the **`herobet`** Firebase project (config in
`web/src/firebase.js` — client config is public by design; access control lives
in Security Rules). Firestore layout:

| Path | Contents |
|---|---|
| `users/{uid}` | private profile |
| `profiles/{uid}` | public leaderboard row (name, equity, pnlPct, trades) |
| `accounts/{uid}` | cash, reserved margin, deposits, trade count |
| `accounts/{uid}/positions/{symbol}` | qty (signed), avgPrice, realised, fees |
| `accounts/{uid}/orders/{id}` | side, type, qty, trigger, status, fill |
| `accounts/{uid}/fills/{id}` | immutable executions |
| `accounts/{uid}/ledger/{id}` | append-only cash journal |
| `accounts/{uid}/watchlist/{symbol}` | starred markets |
| `tape/{id}` | public trade tape across all traders |

If Firestore isn't reachable the app drops into **local mode** and keeps the
whole desk in `localStorage`, so it is never broken — the header chip tells you
which mode you're in. Setup steps: [`docs/SETUP-FIREBASE.md`](docs/SETUP-FIREBASE.md).

## GitHub Pages

The workflow builds `web/` and publishes `web/dist`. The production base path is
`/HeroBet/`, so the deployed URL is:

```text
https://easypay-ng.github.io/HeroBet/
```

Enable Pages with **GitHub Actions** as the source if it isn't showing yet.

## Before this ever touches real money

1. Move order matching, fills and balance mutations into Cloud Functions; set
   the `accounts/{uid}` write rules to `if false`.
2. Enable App Check (reCAPTCHA v3) and rate limiting.
3. Get a licensed market-data agreement — the free endpoints used here are not
   licensed for redistribution.
4. Add KYC/AML, a regulated broker or exchange partner, and the licences your
   market requires.

Until all of that exists, this is a practice terminal. Treat it that way.
