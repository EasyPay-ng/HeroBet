// HeroBet — unified live market feed.
//
// One subscribe() API for every asset class. Internally:
//   crypto  → websocket tick stream from the best reachable exchange,
//             with REST polling as a safety net and automatic venue failover
//   stocks  → REST polling from the connected vendor (15s)
//   fx      → REST polling of reference rates (10 min, or 60s with Twelve Data)
//
// Nothing is simulated. If a class has no reachable source the feed reports it
// as unavailable and the UI says so instead of inventing a price.

import { instrument, listByClass } from "./instruments.js";
import { rankCryptoProviders, intervalSeconds } from "./crypto.js";
import { stockCandles, stockTickers, activeStockProvider, usMarketOpen } from "./equities.js";
import { fxTickers, fxHistory } from "./fx.js";
import { onKeysChanged } from "./keys.js";

const quotes = new Map(); // symbol -> Quote
const subs = new Set(); // {symbols:Set<string>, cb}
const refs = new Map(); // symbol -> refcount

export const status = {
  crypto: { provider: null, transport: "idle", ok: false, detail: "" },
  stock: { provider: null, transport: "idle", ok: false, detail: "" },
  fx: { provider: null, transport: "idle", ok: false, detail: "" },
  probe: [],
};

const statusListeners = new Set();
const quoteListeners = new Set(); // global listeners (every tick)

function emitStatus() {
  for (const cb of statusListeners) {
    try {
      cb(status);
    } catch (e) {
      console.error(e);
    }
  }
}

export function onStatus(cb) {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

export function onAnyQuote(cb) {
  quoteListeners.add(cb);
  return () => quoteListeners.delete(cb);
}

export function getQuote(symbol) {
  return quotes.get(symbol) || null;
}

export function allQuotes() {
  return quotes;
}

/** Mark price used for valuation / fills. */
export function markPrice(symbol) {
  return quotes.get(symbol)?.price || 0;
}

function publish(q) {
  if (!q || !q.price) return;
  const prev = quotes.get(q.symbol);
  q.prevPrice = prev ? prev.price : q.price;
  quotes.set(q.symbol, q);
  for (const s of subs) if (s.symbols.has(q.symbol)) safe(s.cb, q);
  for (const cb of quoteListeners) safe(cb, q);
}

function safe(fn, arg) {
  try {
    fn(arg);
  } catch (e) {
    console.error("feed listener failed", e);
  }
}

function activeSymbols(cls) {
  const out = [];
  for (const [sym, n] of refs) {
    if (n <= 0) continue;
    const inst = instrument(sym);
    if (inst && inst.class === cls) out.push(inst);
  }
  return out;
}

// ───────────────────────────── crypto ─────────────────────────────
let cryptoChain = []; // healthy providers in preference order
let cryptoIdx = 0;
let ws = null;
let wsSymbols = "";
let wsRetry = 0;
let cryptoPoll = null;

const cryptoProvider = () => cryptoChain[cryptoIdx] || null;

function demoteCrypto(reason) {
  if (cryptoIdx < cryptoChain.length - 1) {
    cryptoIdx++;
    status.crypto.detail = `switched venue (${reason})`;
    console.warn("[feed] crypto failover →", cryptoProvider()?.id, reason);
  } else {
    status.crypto.ok = false;
    status.crypto.transport = "down";
    status.crypto.detail = reason;
  }
  emitStatus();
}

async function cryptoRefresh() {
  const list = activeSymbols("crypto");
  if (!list.length) return;
  const p = cryptoProvider();
  if (!p) return;
  try {
    const map = await p.tickers(list);
    if (!map.size) throw new Error("empty");
    for (const q of map.values()) publish(q);
    status.crypto.ok = true;
    status.crypto.provider = p.label;
    if (status.crypto.transport !== "ws") status.crypto.transport = "rest";
    emitStatus();
  } catch (e) {
    demoteCrypto(e?.message || "rest failed");
    const next = cryptoProvider();
    if (next && next !== p) cryptoRefresh();
  }
}

function openCryptoSocket() {
  const list = activeSymbols("crypto");
  const key = list.map((i) => i.symbol).sort().join(",");
  const p = cryptoProvider();
  if (!p || !p.stream || !list.length) return;
  if (ws && key === wsSymbols && ws.readyState <= 1) return;
  closeCryptoSocket();
  wsSymbols = key;
  try {
    const sock = p.stream(list, publish);
    ws = sock;
    sock.addEventListener("open", () => {
      wsRetry = 0;
      status.crypto.transport = "ws";
      status.crypto.provider = p.label;
      status.crypto.ok = true;
      status.crypto.detail = "live tick stream";
      emitStatus();
    });
    sock.addEventListener("error", () => {
      status.crypto.detail = "socket error";
    });
    sock.addEventListener("close", () => {
      if (sock !== ws) return;
      ws = null;
      wsSymbols = "";
      if (status.crypto.transport === "ws") {
        status.crypto.transport = "rest";
        emitStatus();
      }
      wsRetry++;
      if (wsRetry > 2) demoteCrypto("socket unavailable");
      setTimeout(() => activeSymbols("crypto").length && openCryptoSocket(), Math.min(1000 * wsRetry, 8000));
    });
  } catch (e) {
    console.warn("[feed] websocket failed", e);
    status.crypto.transport = "rest";
    emitStatus();
  }
}

function closeCryptoSocket() {
  if (ws) {
    try {
      ws.onclose = null;
      ws.close();
    } catch {
      /* ignore */
    }
  }
  ws = null;
  wsSymbols = "";
}

// ───────────────────────────── stocks ─────────────────────────────
let stockPoll = null;

async function stockRefresh() {
  const list = activeSymbols("stock");
  const p = activeStockProvider();
  if (!p) {
    status.stock.ok = false;
    status.stock.provider = null;
    status.stock.transport = "locked";
    status.stock.detail = "no data key connected";
    emitStatus();
    return;
  }
  if (!list.length) return;
  try {
    const map = await stockTickers(list);
    for (const q of map.values()) publish(q);
    status.stock.ok = true;
    status.stock.provider = p.label;
    status.stock.transport = "rest";
    status.stock.detail = usMarketOpen() ? "US session open" : "US session closed — last close";
  } catch (e) {
    status.stock.ok = false;
    status.stock.transport = "error";
    status.stock.detail = e?.message || "request failed";
  }
  emitStatus();
}

// ───────────────────────────── fx ─────────────────────────────
let fxPoll = null;

async function fxRefresh() {
  const list = activeSymbols("fx");
  if (!list.length) return;
  try {
    const map = await fxTickers(list);
    for (const q of map.values()) publish(q);
    const any = [...map.values()][0];
    status.fx.ok = map.size > 0;
    status.fx.provider = any?.source || "reference rates";
    status.fx.transport = any?.daily ? "daily" : "rest";
    status.fx.detail = any?.daily ? "official daily reference rate" : "intraday";
  } catch (e) {
    status.fx.ok = false;
    status.fx.transport = "error";
    status.fx.detail = e?.message || "request failed";
  }
  emitStatus();
}

// ───────────────────────────── lifecycle ─────────────────────────────
let started = false;
let resyncTimer = null;

function resync() {
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    if (activeSymbols("crypto").length) {
      cryptoRefresh();
      openCryptoSocket();
    } else {
      closeCryptoSocket();
    }
    stockRefresh();
    fxRefresh();
  }, 250);
}

export async function startFeed() {
  if (started) return status;
  started = true;

  const { healthy, report } = await rankCryptoProviders();
  cryptoChain = healthy;
  cryptoIdx = 0;
  status.probe = report;
  if (!healthy.length) {
    status.crypto.ok = false;
    status.crypto.transport = "down";
    status.crypto.detail = "no exchange reachable from this network";
  } else {
    status.crypto.provider = healthy[0].label;
    status.crypto.transport = "rest";
  }
  // Report the stock vendor state straight away so the UI can say "locked"
  // instead of sitting on "idle" until the first debounced sync.
  if (!activeStockProvider()) {
    status.stock.ok = false;
    status.stock.transport = "locked";
    status.stock.detail = "no data key connected";
  }
  emitStatus();

  // safety-net polling — websockets can silently stall behind proxies
  cryptoPoll = setInterval(() => !document.hidden && cryptoRefresh(), 20000);
  stockPoll = setInterval(() => !document.hidden && stockRefresh(), 15000);
  fxPoll = setInterval(() => !document.hidden && fxRefresh(), 300000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    cryptoRefresh();
    openCryptoSocket();
    stockRefresh();
  });
  window.addEventListener("online", () => resync());
  onKeysChanged(() => {
    stockRefresh();
    fxRefresh();
  });

  resync();
  return status;
}

/** Re-probe every venue and restart the crypto transport. */
export async function reconnect() {
  const { healthy, report } = await rankCryptoProviders();
  cryptoChain = healthy;
  cryptoIdx = 0;
  status.probe = report;
  closeCryptoSocket();
  wsRetry = 0;
  emitStatus();
  resync();
  return status;
}

/**
 * Subscribe to live quotes.
 * @param {string[]} symbols
 * @param {(q:object)=>void} cb called on every tick for those symbols
 */
export function subscribe(symbols, cb) {
  const set = new Set(symbols.filter(Boolean));
  const entry = { symbols: set, cb };
  subs.add(entry);
  for (const s of set) refs.set(s, (refs.get(s) || 0) + 1);
  // replay what we already know so the UI paints immediately
  for (const s of set) {
    const q = quotes.get(s);
    if (q) safe(cb, q);
  }
  resync();
  return () => {
    subs.delete(entry);
    for (const s of set) refs.set(s, Math.max(0, (refs.get(s) || 1) - 1));
    resync();
  };
}

/** One-shot snapshot for a list of symbols (used by the markets table). */
export async function snapshot(symbols) {
  const insts = symbols.map(instrument).filter(Boolean);
  const byClass = { crypto: [], stock: [], fx: [] };
  for (const i of insts) byClass[i.class].push(i);
  const jobs = [];
  if (byClass.crypto.length && cryptoProvider()) jobs.push(cryptoProvider().tickers(byClass.crypto).catch(() => new Map()));
  if (byClass.stock.length && activeStockProvider()) jobs.push(stockTickers(byClass.stock).catch(() => new Map()));
  if (byClass.fx.length) jobs.push(fxTickers(byClass.fx).catch(() => new Map()));
  const maps = await Promise.all(jobs);
  for (const m of maps) for (const q of m.values()) publish(q);
  return quotes;
}

// ───────────────────────────── candles / book / tape ─────────────────────────────

/** Historical candles for any instrument, with crypto venue failover. */
export async function candles(symbol, interval = "1h", limit = 300) {
  const inst = instrument(symbol);
  if (!inst) throw new Error("Unknown symbol " + symbol);
  if (inst.class === "crypto") {
    let lastErr;
    for (let i = cryptoIdx; i < cryptoChain.length; i++) {
      try {
        const rows = await cryptoChain[i].candles(inst, interval, limit);
        if (rows?.length) return rows;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("No candle source reachable");
  }
  if (inst.class === "stock") return stockCandles(inst, interval, limit);
  return fxHistory(inst, interval === "1d" ? 180 : 90);
}

export async function orderBook(symbol) {
  const inst = instrument(symbol);
  if (!inst || inst.class !== "crypto") return null;
  const p = cryptoProvider();
  if (!p) return null;
  try {
    return await p.depth(inst);
  } catch {
    return null;
  }
}

export async function recentTrades(symbol) {
  const inst = instrument(symbol);
  if (!inst || inst.class !== "crypto") return [];
  const p = cryptoProvider();
  if (!p) return [];
  try {
    return await p.trades(inst);
  } catch {
    return [];
  }
}

/** Warm the cache for every instrument in a class (markets page). */
export async function warm(cls = "all") {
  const list = cls === "all" ? listByClass("all") : listByClass(cls);
  return snapshot(list.map((i) => i.symbol));
}

export { intervalSeconds };
