// HeroBet — real US equity data.
//
// Stock exchanges don't publish free keyless APIs the way crypto venues do, so
// this module talks to the vendor the user has connected (Settings → Data).
// With no key connected, stocks are shown as "locked" — we never invent prices.

import { jget, num } from "./http.js";
import { getKey, stockVendor } from "./keys.js";

const cache = new Map(); // key -> {t, v}
const CACHE_MS = 15000;

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

const TD_INTERVAL = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day" };
const AV_INTERVAL = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "60min" };

function tdError(res) {
  if (res && res.status === "error") {
    const msg = String(res.message || "Twelve Data error");
    const e = new Error(msg);
    e.code = res.code;
    throw e;
  }
  return res;
}

// ───────────────────────── Twelve Data (quotes + candles) ─────────────────────────
const twelvedata = {
  id: "twelvedata",
  label: "Twelve Data",
  supportsCandles: true,
  async tickers(list) {
    const key = getKey("twelvedata");
    const symbols = list.map((i) => i.symbol).join(",");
    const res = await cached(`td:q:${symbols}`, CACHE_MS, () =>
      jget(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${key}`, { timeout: 12000 })
    );
    tdError(res);
    const out = new Map();
    const rows = list.length === 1 ? { [list[0].symbol]: res } : res;
    for (const inst of list) {
      const r = rows?.[inst.symbol];
      if (!r || r.status === "error") continue;
      const price = num(r.close);
      out.set(inst.symbol, {
        symbol: inst.symbol,
        price,
        changePct: num(r.percent_change),
        high24h: num(r.high),
        low24h: num(r.low),
        volume24h: num(r.volume) * price,
        bid: price,
        ask: price,
        ts: Date.now(),
        marketOpen: r.is_market_open !== false,
        source: "twelvedata",
      });
    }
    return out;
  },
  async candles(inst, interval, limit = 300) {
    const key = getKey("twelvedata");
    const iv = TD_INTERVAL[interval] || "1h";
    const res = await jget(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.symbol)}&interval=${iv}&outputsize=${Math.min(limit, 500)}&apikey=${key}`,
      { timeout: 15000 }
    );
    tdError(res);
    return (res.values || [])
      .map((v) => ({
        time: Math.floor(Date.parse(v.datetime.length <= 10 ? v.datetime + "T00:00:00Z" : v.datetime + "Z") / 1000),
        open: num(v.open),
        high: num(v.high),
        low: num(v.low),
        close: num(v.close),
        volume: num(v.volume),
      }))
      .reverse();
  },
};

// ───────────────────────── Finnhub (real-time quotes) ─────────────────────────
const finnhub = {
  id: "finnhub",
  label: "Finnhub",
  supportsCandles: false,
  async tickers(list) {
    const key = getKey("finnhub");
    const out = new Map();
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const inst = queue.shift();
        try {
          const r = await cached(`fh:${inst.symbol}`, CACHE_MS, () =>
            jget(`https://finnhub.io/api/v1/quote?symbol=${inst.symbol}&token=${key}`, { timeout: 9000 })
          );
          if (!r || !num(r.c)) continue;
          out.set(inst.symbol, {
            symbol: inst.symbol,
            price: num(r.c),
            changePct: num(r.dp),
            high24h: num(r.h),
            low24h: num(r.l),
            volume24h: 0,
            bid: num(r.c),
            ask: num(r.c),
            ts: num(r.t) * 1000 || Date.now(),
            source: "finnhub",
          });
        } catch {
          /* skip symbol */
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!out.size) throw new Error("FINNHUB_EMPTY");
    return out;
  },
  async candles() {
    throw new Error("Finnhub's free tier no longer serves candles — connect Twelve Data for charts.");
  },
};

// ───────────────────────── Alpha Vantage ─────────────────────────
const alphavantage = {
  id: "alphavantage",
  label: "Alpha Vantage",
  supportsCandles: true,
  async tickers(list) {
    const key = getKey("alphavantage");
    const out = new Map();
    // Very low rate limit: fetch sequentially and lean on the cache.
    for (const inst of list) {
      try {
        const r = await cached(`av:${inst.symbol}`, 60000, () =>
          jget(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${inst.symbol}&apikey=${key}`, {
            timeout: 12000,
          })
        );
        const q = r?.["Global Quote"];
        if (!q || !num(q["05. price"])) continue;
        out.set(inst.symbol, {
          symbol: inst.symbol,
          price: num(q["05. price"]),
          changePct: num(String(q["10. change percent"] || "").replace("%", "")),
          high24h: num(q["03. high"]),
          low24h: num(q["04. low"]),
          volume24h: num(q["06. volume"]) * num(q["05. price"]),
          bid: num(q["05. price"]),
          ask: num(q["05. price"]),
          ts: Date.now(),
          source: "alphavantage",
        });
      } catch {
        /* skip */
      }
    }
    if (!out.size) throw new Error("ALPHAVANTAGE_EMPTY");
    return out;
  },
  async candles(inst, interval) {
    const key = getKey("alphavantage");
    const intraday = AV_INTERVAL[interval];
    const url = intraday
      ? `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${inst.symbol}&interval=${intraday}&outputsize=compact&apikey=${key}`
      : `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${inst.symbol}&outputsize=compact&apikey=${key}`;
    const res = await jget(url, { timeout: 15000 });
    const seriesKey = Object.keys(res).find((k) => k.startsWith("Time Series"));
    if (!seriesKey) throw new Error(res?.Note || res?.Information || "No Alpha Vantage data");
    return Object.entries(res[seriesKey])
      .map(([t, v]) => ({
        time: Math.floor(Date.parse(t.length <= 10 ? t + "T00:00:00Z" : t + "Z") / 1000),
        open: num(v["1. open"]),
        high: num(v["2. high"]),
        low: num(v["3. low"]),
        close: num(v["4. close"]),
        volume: num(v["5. volume"]),
      }))
      .sort((a, b) => a.time - b.time);
  },
};

const VENDOR_IMPL = { twelvedata, finnhub, alphavantage };

export function activeStockProvider() {
  const v = stockVendor();
  return v ? VENDOR_IMPL[v] : null;
}

export async function stockTickers(list) {
  const p = activeStockProvider();
  if (!p) throw new Error("NO_STOCK_KEY");
  return p.tickers(list);
}

export async function stockCandles(inst, interval, limit) {
  const p = activeStockProvider();
  if (!p) throw new Error("NO_STOCK_KEY");
  return p.candles(inst, interval, limit);
}

/** US cash session (09:30–16:00 America/New_York), weekdays. Used for labelling only. */
export function usMarketOpen(now = new Date()) {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ny.getHours() * 60 + ny.getMinutes();
  return mins >= 570 && mins < 960;
}
