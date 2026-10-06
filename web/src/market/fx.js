// HeroBet — real foreign-exchange rates.
//
// Keyless sources (all CORS-enabled, no registration):
//   • open.er-api.com        — 160+ currencies incl. NGN/GHS/KES, daily refresh
//   • @fawazahmed0/currency-api on jsDelivr — same coverage + dated history
//   • frankfurter.app        — ECB reference rates, one-shot time series
// With a Twelve Data key connected you additionally get intraday FX candles.

import { jget, num } from "./http.js";
import { getKey, fxVendor } from "./keys.js";

let latestUsd = null; // {rates:{CUR:rate}, ts, source}
let inflight = null;

const JSD = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api";
const JSD_FALLBACK = "https://latest.currency-api.pages.dev";

/** Fetch the full USD rate table (cached ~10 min). */
export async function usdRates(force = false) {
  if (!force && latestUsd && Date.now() - latestUsd.ts < 600000) return latestUsd;
  if (inflight) return inflight;
  inflight = (async () => {
    const attempts = [
      async () => {
        const r = await jget("https://open.er-api.com/v6/latest/USD", { timeout: 10000 });
        if (r?.result !== "success" || !r.rates) throw new Error("ER_API_BAD");
        return { rates: r.rates, ts: Date.now(), asOf: (r.time_last_update_unix || 0) * 1000, source: "open.er-api.com" };
      },
      async () => {
        const r = await jget(`${JSD}@latest/v1/currencies/usd.json`, { timeout: 10000 });
        const rates = {};
        for (const [k, v] of Object.entries(r.usd || {})) rates[k.toUpperCase()] = num(v);
        if (!rates.NGN && !rates.EUR) throw new Error("JSD_BAD");
        return { rates, ts: Date.now(), asOf: Date.parse(r.date + "T00:00:00Z"), source: "currency-api" };
      },
      async () => {
        const r = await jget("https://api.frankfurter.app/latest?from=USD", { timeout: 10000 });
        return { rates: { ...r.rates, USD: 1 }, ts: Date.now(), asOf: Date.parse(r.date + "T00:00:00Z"), source: "frankfurter (ECB)" };
      },
    ];
    let err;
    for (const a of attempts) {
      try {
        latestUsd = await a();
        return latestUsd;
      } catch (e) {
        err = e;
      }
    }
    throw err || new Error("FX_UNAVAILABLE");
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const rateOf = (table, cur) => (cur === "USD" ? 1 : num(table[cur]));

/** Cross rate base/quote derived from the USD table. */
export function crossRate(table, base, quote) {
  const b = rateOf(table, base);
  const q = rateOf(table, quote);
  if (!b || !q) return 0;
  return q / b;
}

// ───────────────────────── quotes ─────────────────────────

let prevTable = null; // yesterday's table, for a real daily % change

async function yesterdayRates() {
  if (prevTable && Date.now() - prevTable.ts < 3600000) return prevTable;
  const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  try {
    const r = await jget(`${JSD}@${d}/v1/currencies/usd.json`, { timeout: 10000 });
    const rates = {};
    for (const [k, v] of Object.entries(r.usd || {})) rates[k.toUpperCase()] = num(v);
    prevTable = { rates, ts: Date.now() };
  } catch {
    prevTable = { rates: {}, ts: Date.now() };
  }
  return prevTable;
}

export async function fxTickers(list) {
  if (fxVendor()) {
    try {
      return await twelveDataFx(list);
    } catch {
      /* fall through to keyless */
    }
  }
  const [now, prev] = await Promise.all([usdRates(), yesterdayRates()]);
  const out = new Map();
  for (const inst of list) {
    const price = crossRate(now.rates, inst.base, inst.quote);
    if (!price) continue;
    const before = crossRate(prev.rates, inst.base, inst.quote);
    out.set(inst.symbol, {
      symbol: inst.symbol,
      price,
      changePct: before ? ((price - before) / before) * 100 : 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      bid: price,
      ask: price,
      ts: now.asOf || now.ts,
      daily: true, // flag: this is a daily reference rate, not a live tick
      source: now.source,
    });
  }
  return out;
}

async function twelveDataFx(list) {
  const key = getKey("twelvedata");
  const symbols = list.map((i) => i.symbol).join(",");
  const res = await jget(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${key}`, {
    timeout: 12000,
  });
  if (res?.status === "error") throw new Error(res.message);
  const rows = list.length === 1 ? { [list[0].symbol]: res } : res;
  const out = new Map();
  for (const inst of list) {
    const r = rows?.[inst.symbol];
    if (!r || r.status === "error" || !num(r.close)) continue;
    const price = num(r.close);
    out.set(inst.symbol, {
      symbol: inst.symbol,
      price,
      changePct: num(r.percent_change),
      high24h: num(r.high),
      low24h: num(r.low),
      volume24h: 0,
      bid: price,
      ask: price,
      ts: Date.now(),
      source: "twelvedata",
    });
  }
  if (!out.size) throw new Error("TD_FX_EMPTY");
  return out;
}

// ───────────────────────── history ─────────────────────────

const ECB = new Set(["EUR", "USD", "JPY", "GBP", "CHF", "CAD", "AUD", "CNY", "INR", "ZAR", "SEK", "NOK", "PLN", "TRY", "BRL", "MXN"]);
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Daily closes for an FX pair.
 * ECB-covered pairs come back in a single request; everything else (NGN, GHS,
 * KES …) is assembled from the dated currency-api files on jsDelivr.
 */
export async function fxHistory(inst, days = 90) {
  if (fxVendor()) {
    try {
      const key = getKey("twelvedata");
      const res = await jget(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.symbol)}&interval=1day&outputsize=${days}&apikey=${key}`,
        { timeout: 15000 }
      );
      if (res?.status !== "error" && res?.values?.length) {
        return res.values
          .map((v) => ({
            time: Math.floor(Date.parse(v.datetime + "T00:00:00Z") / 1000),
            open: num(v.open),
            high: num(v.high),
            low: num(v.low),
            close: num(v.close),
            volume: 0,
          }))
          .reverse();
      }
    } catch {
      /* fall through */
    }
  }

  if (ECB.has(inst.base) && ECB.has(inst.quote)) {
    const from = dayStr(Date.now() - days * 86400000);
    const r = await jget(`https://api.frankfurter.app/${from}..?from=${inst.base}&to=${inst.quote}`, { timeout: 15000 });
    const rows = Object.entries(r.rates || {})
      .map(([d, v]) => ({ time: Math.floor(Date.parse(d + "T00:00:00Z") / 1000), close: num(v[inst.quote]) }))
      .filter((x) => x.close)
      .sort((a, b) => a.time - b.time);
    return toCandles(rows);
  }

  // dated per-pair files (tiny: ~80 bytes each), fetched with a concurrency cap
  const dates = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // FX weekend
    dates.push(dayStr(d.getTime()));
  }
  const base = inst.base.toLowerCase();
  const quote = inst.quote.toLowerCase();
  const rows = [];
  const queue = [...dates];
  const worker = async () => {
    while (queue.length) {
      const d = queue.shift();
      const paths = [`${JSD}@${d}/v1/currencies/${base}/${quote}.json`, `${JSD_FALLBACK}/v1/currencies/${base}/${quote}.json`];
      for (const url of paths) {
        try {
          const r = await jget(url, { timeout: 8000 });
          const v = num(r[quote]);
          if (v) rows.push({ time: Math.floor(Date.parse(d + "T00:00:00Z") / 1000), close: v });
          break;
        } catch {
          /* try next / skip day */
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  rows.sort((a, b) => a.time - b.time);
  return toCandles(rows);
}

/** Daily reference rates are closes only — expose them as a continuous series. */
function toCandles(rows) {
  return rows.map((r, i) => {
    const open = i ? rows[i - 1].close : r.close;
    return {
      time: r.time,
      open,
      high: Math.max(open, r.close),
      low: Math.min(open, r.close),
      close: r.close,
      volume: 0,
    };
  });
}

/** Live USD→NGN (and friends) for the currency switcher in the header. */
export async function usdTo(currency) {
  if (currency === "USD") return 1;
  const t = await usdRates();
  return rateOf(t.rates, currency) || 0;
}
