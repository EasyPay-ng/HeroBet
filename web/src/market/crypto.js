// HeroBet — real crypto market data.
//
// Four independent public exchange APIs, tried in order until one answers.
// This matters in practice: some exchange domains are blocked by ISPs in
// certain countries (Binance in Nigeria, for example), so the app must be able
// to fall through to another venue instead of showing a dead screen.
//
// Every adapter exposes the same shape:
//   probe()                      -> resolves if the venue is reachable
//   tickers(instruments)         -> Map<symbol, Quote>
//   candles(inst, interval, n)   -> [{time(sec), open, high, low, close, volume}]
//   depth(inst)                  -> {bids:[[price,qty]], asks:[[price,qty]]}
//   trades(inst)                 -> [{ts, price, qty, side}]
//   stream(instruments, onQuote) -> close()   (websocket; optional)

import { hostPool, aggregateCandles, num } from "./http.js";

/** @typedef {{symbol:string,price:number,changePct:number,high24h:number,low24h:number,volume24h:number,bid:number,ask:number,ts:number,source:string}} Quote */

const INTERVAL_SEC = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
export const INTERVALS = Object.keys(INTERVAL_SEC);
export const intervalSeconds = (i) => INTERVAL_SEC[i] || 60;

// ───────────────────────────── Binance ─────────────────────────────
// data-api.binance.vision is Binance's public market-data-only mirror; it is
// usually reachable where the main trading domain is not.
const binanceHosts = hostPool([
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
]);

const BINANCE_BAR = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };

const binance = {
  id: "binance",
  label: "Binance",
  hasWs: true,
  sym: (inst) => inst.base + "USDT",
  probe: () => binanceHosts.get("/api/v3/ping", { timeout: 5000 }),
  async tickers(list) {
    const syms = list.map((i) => this.sym(i));
    const q = encodeURIComponent(JSON.stringify(syms));
    const rows = await binanceHosts.get(`/api/v3/ticker/24hr?symbols=${q}`, { timeout: 10000 });
    const byProvider = new Map(rows.map((r) => [r.symbol, r]));
    const out = new Map();
    for (const inst of list) {
      const r = byProvider.get(this.sym(inst));
      if (!r) continue;
      out.set(inst.symbol, {
        symbol: inst.symbol,
        price: num(r.lastPrice),
        changePct: num(r.priceChangePercent),
        high24h: num(r.highPrice),
        low24h: num(r.lowPrice),
        volume24h: num(r.quoteVolume),
        bid: num(r.bidPrice),
        ask: num(r.askPrice),
        ts: Date.now(),
        source: "binance",
      });
    }
    return out;
  },
  async candles(inst, interval, limit = 300) {
    const rows = await binanceHosts.get(
      `/api/v3/klines?symbol=${this.sym(inst)}&interval=${BINANCE_BAR[interval]}&limit=${limit}`
    );
    return rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: num(r[5]),
    }));
  },
  async depth(inst) {
    const d = await binanceHosts.get(`/api/v3/depth?symbol=${this.sym(inst)}&limit=20`);
    return {
      bids: d.bids.map((b) => [num(b[0]), num(b[1])]),
      asks: d.asks.map((a) => [num(a[0]), num(a[1])]),
    };
  },
  async trades(inst) {
    const rows = await binanceHosts.get(`/api/v3/trades?symbol=${this.sym(inst)}&limit=40`);
    return rows
      .map((t) => ({ ts: t.time, price: num(t.price), qty: num(t.qty), side: t.isBuyerMaker ? "sell" : "buy" }))
      .reverse();
  },
  stream(list, onQuote) {
    const streams = list.map((i) => this.sym(i).toLowerCase() + "@ticker").join("/");
    const ws = new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`);
    const back = new Map(list.map((i) => [this.sym(i), i.symbol]));
    ws.onmessage = (ev) => {
      try {
        const { data: d } = JSON.parse(ev.data);
        const symbol = back.get(d.s);
        if (!symbol) return;
        onQuote({
          symbol,
          price: num(d.c),
          changePct: num(d.P),
          high24h: num(d.h),
          low24h: num(d.l),
          volume24h: num(d.q),
          bid: num(d.b),
          ask: num(d.a),
          ts: d.E || Date.now(),
          source: "binance",
        });
      } catch {
        /* ignore malformed frame */
      }
    };
    return ws;
  },
};

// ───────────────────────────── Bybit ─────────────────────────────
const bybitHosts = hostPool(["https://api.bybit.com", "https://api.bytick.com"]);
const BYBIT_BAR = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" };

const bybit = {
  id: "bybit",
  label: "Bybit",
  hasWs: true,
  sym: (inst) => inst.base + "USDT",
  probe: () => bybitHosts.get("/v5/market/time", { timeout: 5000 }),
  async tickers(list) {
    const res = await bybitHosts.get("/v5/market/tickers?category=spot", { timeout: 10000 });
    const rows = res?.result?.list || [];
    const byProvider = new Map(rows.map((r) => [r.symbol, r]));
    const out = new Map();
    for (const inst of list) {
      const r = byProvider.get(this.sym(inst));
      if (!r) continue;
      out.set(inst.symbol, {
        symbol: inst.symbol,
        price: num(r.lastPrice),
        changePct: num(r.price24hPcnt) * 100,
        high24h: num(r.highPrice24h),
        low24h: num(r.lowPrice24h),
        volume24h: num(r.turnover24h),
        bid: num(r.bid1Price),
        ask: num(r.ask1Price),
        ts: Date.now(),
        source: "bybit",
      });
    }
    return out;
  },
  async candles(inst, interval, limit = 300) {
    const res = await bybitHosts.get(
      `/v5/market/kline?category=spot&symbol=${this.sym(inst)}&interval=${BYBIT_BAR[interval]}&limit=${Math.min(limit, 1000)}`
    );
    const rows = res?.result?.list || [];
    return rows
      .map((r) => ({
        time: Math.floor(num(r[0]) / 1000),
        open: num(r[1]),
        high: num(r[2]),
        low: num(r[3]),
        close: num(r[4]),
        volume: num(r[5]),
      }))
      .reverse();
  },
  async depth(inst) {
    const res = await bybitHosts.get(`/v5/market/orderbook?category=spot&symbol=${this.sym(inst)}&limit=20`);
    const r = res?.result || {};
    return {
      bids: (r.b || []).map((b) => [num(b[0]), num(b[1])]),
      asks: (r.a || []).map((a) => [num(a[0]), num(a[1])]),
    };
  },
  async trades(inst) {
    const res = await bybitHosts.get(`/v5/market/recent-trade?category=spot&symbol=${this.sym(inst)}&limit=40`);
    return (res?.result?.list || []).map((t) => ({
      ts: num(t.time),
      price: num(t.price),
      qty: num(t.size),
      side: String(t.side || "").toLowerCase() === "buy" ? "buy" : "sell",
    }));
  },
  stream(list, onQuote) {
    const ws = new WebSocket("wss://stream.bybit.com/v5/public/spot");
    const back = new Map(list.map((i) => [this.sym(i), i.symbol]));
    const cache = new Map();
    let ping;
    ws.onopen = () => {
      ws.send(JSON.stringify({ op: "subscribe", args: list.map((i) => `tickers.${this.sym(i)}`) }));
      ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ op: "ping" })), 20000);
    };
    ws.onclose = () => clearInterval(ping);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const d = msg?.data;
        if (!d || !d.symbol) return;
        const symbol = back.get(d.symbol);
        if (!symbol) return;
        // spot tickers arrive as snapshot then partial deltas — merge them
        const prev = cache.get(symbol) || {};
        const merged = { ...prev, ...d };
        cache.set(symbol, merged);
        onQuote({
          symbol,
          price: num(merged.lastPrice),
          changePct: num(merged.price24hPcnt) * 100,
          high24h: num(merged.highPrice24h),
          low24h: num(merged.lowPrice24h),
          volume24h: num(merged.turnover24h),
          bid: num(merged.bid1Price) || num(merged.lastPrice),
          ask: num(merged.ask1Price) || num(merged.lastPrice),
          ts: num(msg.ts) || Date.now(),
          source: "bybit",
        });
      } catch {
        /* ignore */
      }
    };
    return ws;
  },
};

// ───────────────────────────── OKX ─────────────────────────────
const okxHosts = hostPool(["https://www.okx.com", "https://aws.okx.com"]);
const OKX_BAR = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };

const okx = {
  id: "okx",
  label: "OKX",
  hasWs: true,
  sym: (inst) => `${inst.base}-USDT`,
  probe: () => okxHosts.get("/api/v5/public/time", { timeout: 5000 }),
  async tickers(list) {
    const res = await okxHosts.get("/api/v5/market/tickers?instType=SPOT", { timeout: 10000 });
    const byProvider = new Map((res?.data || []).map((r) => [r.instId, r]));
    const out = new Map();
    for (const inst of list) {
      const r = byProvider.get(this.sym(inst));
      if (!r) continue;
      const open = num(r.open24h);
      const last = num(r.last);
      out.set(inst.symbol, {
        symbol: inst.symbol,
        price: last,
        changePct: open ? ((last - open) / open) * 100 : 0,
        high24h: num(r.high24h),
        low24h: num(r.low24h),
        volume24h: num(r.volCcy24h),
        bid: num(r.bidPx) || last,
        ask: num(r.askPx) || last,
        ts: num(r.ts) || Date.now(),
        source: "okx",
      });
    }
    return out;
  },
  async candles(inst, interval, limit = 300) {
    const res = await okxHosts.get(
      `/api/v5/market/candles?instId=${this.sym(inst)}&bar=${OKX_BAR[interval]}&limit=${Math.min(limit, 300)}`
    );
    return (res?.data || [])
      .map((r) => ({
        time: Math.floor(num(r[0]) / 1000),
        open: num(r[1]),
        high: num(r[2]),
        low: num(r[3]),
        close: num(r[4]),
        volume: num(r[5]),
      }))
      .reverse();
  },
  async depth(inst) {
    const res = await okxHosts.get(`/api/v5/market/books?instId=${this.sym(inst)}&sz=20`);
    const d = res?.data?.[0] || {};
    return {
      bids: (d.bids || []).map((b) => [num(b[0]), num(b[1])]),
      asks: (d.asks || []).map((a) => [num(a[0]), num(a[1])]),
    };
  },
  async trades(inst) {
    const res = await okxHosts.get(`/api/v5/market/trades?instId=${this.sym(inst)}&limit=40`);
    return (res?.data || []).map((t) => ({
      ts: num(t.ts),
      price: num(t.px),
      qty: num(t.sz),
      side: t.side === "buy" ? "buy" : "sell",
    }));
  },
  stream(list, onQuote) {
    const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
    const back = new Map(list.map((i) => [this.sym(i), i.symbol]));
    let ping;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ op: "subscribe", args: list.map((i) => ({ channel: "tickers", instId: this.sym(i) })) })
      );
      ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 20000);
    };
    ws.onclose = () => clearInterval(ping);
    ws.onmessage = (ev) => {
      if (ev.data === "pong") return;
      try {
        const msg = JSON.parse(ev.data);
        for (const r of msg?.data || []) {
          const symbol = back.get(r.instId);
          if (!symbol) continue;
          const open = num(r.open24h);
          const last = num(r.last);
          onQuote({
            symbol,
            price: last,
            changePct: open ? ((last - open) / open) * 100 : 0,
            high24h: num(r.high24h),
            low24h: num(r.low24h),
            volume24h: num(r.volCcy24h),
            bid: num(r.bidPx) || last,
            ask: num(r.askPx) || last,
            ts: num(r.ts) || Date.now(),
            source: "okx",
          });
        }
      } catch {
        /* ignore */
      }
    };
    return ws;
  },
};

// ───────────────────────────── Coinbase ─────────────────────────────
const cbHosts = hostPool(["https://api.exchange.coinbase.com"]);
const CB_GRAN = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 3600, "1d": 86400 };

const coinbase = {
  id: "coinbase",
  label: "Coinbase",
  hasWs: true,
  sym: (inst) => `${inst.base}-USD`,
  probe: () => cbHosts.get("/time", { timeout: 5000 }),
  async tickers(list) {
    // No bulk endpoint — fetch stats per product with a small concurrency cap.
    const out = new Map();
    const q = [...list];
    const worker = async () => {
      while (q.length) {
        const inst = q.shift();
        try {
          const s = await cbHosts.get(`/products/${this.sym(inst)}/stats`, { timeout: 8000 });
          const open = num(s.open);
          const last = num(s.last);
          out.set(inst.symbol, {
            symbol: inst.symbol,
            price: last,
            changePct: open ? ((last - open) / open) * 100 : 0,
            high24h: num(s.high),
            low24h: num(s.low),
            volume24h: num(s.volume) * last,
            bid: last,
            ask: last,
            ts: Date.now(),
            source: "coinbase",
          });
        } catch {
          /* product may not exist on Coinbase */
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!out.size) throw new Error("COINBASE_EMPTY");
    return out;
  },
  async candles(inst, interval, limit = 300) {
    const gran = CB_GRAN[interval];
    const rows = await cbHosts.get(`/products/${this.sym(inst)}/candles?granularity=${gran}`);
    const candles = rows
      .map((r) => ({ time: num(r[0]), low: num(r[1]), high: num(r[2]), open: num(r[3]), close: num(r[4]), volume: num(r[5]) }))
      .reverse();
    return interval === "4h" ? aggregateCandles(candles, 4) : candles.slice(-limit);
  },
  async depth(inst) {
    const d = await cbHosts.get(`/products/${this.sym(inst)}/book?level=2`);
    return {
      bids: (d.bids || []).slice(0, 20).map((b) => [num(b[0]), num(b[1])]),
      asks: (d.asks || []).slice(0, 20).map((a) => [num(a[0]), num(a[1])]),
    };
  },
  async trades(inst) {
    const rows = await cbHosts.get(`/products/${this.sym(inst)}/trades?limit=40`);
    return rows.map((t) => ({
      ts: Date.parse(t.time),
      price: num(t.price),
      qty: num(t.size),
      side: t.side === "buy" ? "sell" : "buy", // Coinbase reports the maker side
    }));
  },
  stream(list, onQuote) {
    const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    const back = new Map(list.map((i) => [this.sym(i), i.symbol]));
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: "subscribe", product_ids: list.map((i) => this.sym(i)), channels: ["ticker"] }));
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type !== "ticker") return;
        const symbol = back.get(d.product_id);
        if (!symbol) return;
        const open = num(d.open_24h);
        const last = num(d.price);
        onQuote({
          symbol,
          price: last,
          changePct: open ? ((last - open) / open) * 100 : 0,
          high24h: num(d.high_24h),
          low24h: num(d.low_24h),
          volume24h: num(d.volume_24h) * last,
          bid: num(d.best_bid) || last,
          ask: num(d.best_ask) || last,
          ts: Date.parse(d.time) || Date.now(),
          source: "coinbase",
        });
      } catch {
        /* ignore */
      }
    };
    return ws;
  },
};

// ───────────────────────── CoinGecko (last resort) ─────────────────────────
const cgHosts = hostPool(["https://api.coingecko.com"]);

const coingecko = {
  id: "coingecko",
  label: "CoinGecko",
  hasWs: false,
  sym: (inst) => inst.cg,
  probe: () => cgHosts.get("/api/v3/ping", { timeout: 6000 }),
  async tickers(list) {
    const ids = list.map((i) => i.cg).filter(Boolean).join(",");
    const res = await cgHosts.get(
      `/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
      { timeout: 12000 }
    );
    const out = new Map();
    for (const inst of list) {
      const r = res[inst.cg];
      if (!r) continue;
      const price = num(r.usd);
      out.set(inst.symbol, {
        symbol: inst.symbol,
        price,
        changePct: num(r.usd_24h_change),
        high24h: 0,
        low24h: 0,
        volume24h: num(r.usd_24h_vol),
        bid: price,
        ask: price,
        ts: Date.now(),
        source: "coingecko",
      });
    }
    return out;
  },
  async candles(inst, interval) {
    const days = interval === "1d" ? 365 : interval === "4h" || interval === "1h" ? 30 : 1;
    const rows = await cgHosts.get(`/api/v3/coins/${inst.cg}/ohlc?vs_currency=usd&days=${days}`, { timeout: 12000 });
    return rows.map((r) => ({
      time: Math.floor(num(r[0]) / 1000),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: 0,
    }));
  },
  async depth() {
    return { bids: [], asks: [] };
  },
  async trades() {
    return [];
  },
  stream: null,
};

export const CRYPTO_PROVIDERS = [binance, bybit, okx, coinbase, coingecko];

/**
 * Probe every venue in parallel and return them ordered: reachable ones first
 * (in preference order), so the feed can fail over without re-probing.
 */
export async function rankCryptoProviders() {
  const results = await Promise.all(
    CRYPTO_PROVIDERS.map(async (p) => {
      const t0 = performance.now();
      try {
        await p.probe();
        return { p, ok: true, ms: performance.now() - t0 };
      } catch (e) {
        return { p, ok: false, ms: Infinity, err: e?.message };
      }
    })
  );
  return {
    healthy: results.filter((r) => r.ok).map((r) => r.p),
    report: results.map((r) => ({ id: r.p.id, ok: r.ok, ms: Math.round(r.ms), err: r.err })),
  };
}
