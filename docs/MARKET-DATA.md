# HeroBet — market data

Every price in the app is fetched by **your browser** directly from a public
market-data API. There is no HeroBet backend proxying quotes, and no synthetic
price generator anywhere in the codebase. If a source can't be reached, the UI
says so instead of inventing a number.

## Provider matrix

### Crypto — no key, live websocket ticks

Tried in this order; the first venue that answers a health probe wins, and the
app fails over automatically if it later stops responding.

| # | Venue | REST host | Stream | Notes |
|---|---|---|---|---|
| 1 | Binance | `data-api.binance.vision` (then `api.binance.com`, `api-gcp`, `api1`) | `wss://data-stream.binance.vision` | `binance.vision` is the market-data-only mirror; often reachable where the trading domain is blocked |
| 2 | Bybit | `api.bybit.com`, `api.bytick.com` | `wss://stream.bybit.com/v5/public/spot` | snapshot + delta ticker frames are merged client-side |
| 3 | OKX | `www.okx.com`, `aws.okx.com` | `wss://ws.okx.com:8443/ws/v5/public` | |
| 4 | Coinbase | `api.exchange.coinbase.com` | `wss://ws-feed.exchange.coinbase.com` | no bulk ticker endpoint, so quotes are fetched 4-at-a-time |
| 5 | CoinGecko | `api.coingecko.com` | — | last resort: price + 24h change only, aggressively rate-limited |

Each adapter supplies quotes, OHLC candles (`1m/5m/15m/1h/4h/1d`), order-book
depth and the recent trade tape. Code: [`web/src/market/crypto.js`](../web/src/market/crypto.js).

> **Why the failover matters.** Nigeria ordered ISPs to block Binance domains in
> 2024, and several other jurisdictions block individual exchanges. A single
> hard-coded venue would leave the terminal blank for those users.

### Stocks — one free key required

US equities have no free keyless API with permissive CORS, so HeroBet asks you
to connect a vendor. Keys live in `localStorage` only and are never uploaded.

| Vendor | Free tier | Quotes | Candles | Get a key |
|---|---|---|---|---|
| **Twelve Data** (preferred) | 800 req/day | ✅ | ✅ | <https://twelvedata.com/pricing> |
| Finnhub | 60 req/min | ✅ | ❌ (now paid) | <https://finnhub.io/register> |
| Alpha Vantage | 25 req/day | ✅ | ✅ (slow) | <https://www.alphavantage.co/support/#api-key> |

Connect one in **Settings → Market data**. Until then the stock rows render in a
locked state with a link to that screen.

A build-time default can also be baked in with Vite env vars — create
`web/.env.local`:

```bash
VITE_TWELVEDATA_KEY=your_key_here
# VITE_FINNHUB_KEY=...
# VITE_ALPHAVANTAGE_KEY=...
```

(`.env` is already git-ignored.)

### Forex — no key

| Source | Coverage | Used for |
|---|---|---|
| `open.er-api.com/v6/latest/USD` | 160+ currencies incl. NGN, GHS, KES | live rate table (primary) |
| `@fawazahmed0/currency-api` via jsDelivr | same coverage, **dated history** | fallback latest + daily history for non-ECB pairs |
| `api.frankfurter.app` | ECB reference currencies | one-shot daily time series |
| Twelve Data | intraday | upgrade path when a key is connected |

FX reference rates publish once per business day, so those quotes carry a
`daily` badge and the pair's chart is a daily-close series rather than intraday
candles. With a Twelve Data key connected, FX becomes intraday automatically.

Code: [`web/src/market/fx.js`](../web/src/market/fx.js).

## Architecture

```
market/instruments.js   the 62-symbol universe + per-symbol tick/lot precision
market/http.js          fetch with timeout, multi-host pools, candle aggregation
market/crypto.js        4 exchange adapters + CoinGecko, all one interface
market/equities.js      Twelve Data / Finnhub / Alpha Vantage adapters
market/fx.js            reference-rate sources + dated history assembly
market/keys.js          vendor key storage (localStorage + Vite env defaults)
market/feed.js          one subscribe() API: streaming, polling, failover, status
```

`feed.js` is the only module the UI talks to:

```js
import { subscribe, getQuote, candles, orderBook, recentTrades, onStatus } from "./market/feed.js";

const stop = subscribe(["BTC-USD", "AAPL", "USD/NGN"], (quote) => render(quote));
const bars = await candles("BTC-USD", "1h", 400);
```

It reference-counts symbols, keeps exactly one websocket open for whatever is
currently on screen, polls REST as a safety net (crypto 20s, stocks 15s, FX 5m),
pauses while the tab is hidden, and re-syncs on `online` / `visibilitychange`.

## Diagnosing a dead feed

**Settings → Feed status** shows the live transport per asset class plus the raw
venue probe (latency or the error for each exchange). **Re-probe venues** re-runs
the whole discovery and reconnects.

Common causes:

| Symptom | Cause | Fix |
|---|---|---|
| All crypto venues `unreachable` | network/DNS blocking, or offline | try another network; the probe table names the failing hosts |
| Crypto works, transport stuck on `rest` | websockets blocked by a proxy | harmless — quotes still refresh every 20s |
| Stocks `locked` | no vendor key | add one in Settings |
| Stocks `error: You have run out of API credits` | free-tier quota | wait for the window, or switch vendor |
| FX shows yesterday's rate | reference rates publish daily | expected; connect Twelve Data for intraday |

## Licensing note

These endpoints are free for personal/evaluation use, not for redistribution.
Before putting this in front of real users you need a commercial market-data
agreement with each vendor.
