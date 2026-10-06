// HeroBet — small fetch helpers shared by every market-data provider.

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/** GET JSON with a hard timeout. Throws on non-2xx or timeout. */
export async function jget(url, { timeout = 9000, headers } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, mode: "cors", cache: "no-store" });
    if (!res.ok) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new HttpError(res.status, url, body);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** GET text (CSV endpoints). */
export async function tget(url, { timeout = 9000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: "cors", cache: "no-store" });
    if (!res.ok) throw new HttpError(res.status, url, "");
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Try each host in order until one answers; remembers the winner. */
export function hostPool(hosts) {
  let preferred = 0;
  return {
    get host() {
      return hosts[preferred];
    },
    async get(path, opts) {
      let lastErr;
      for (let i = 0; i < hosts.length; i++) {
        const idx = (preferred + i) % hosts.length;
        try {
          const out = await jget(hosts[idx] + path, opts);
          preferred = idx;
          return out;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("ALL_HOSTS_FAILED");
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bucket finer candles into a coarser interval (e.g. 1h -> 4h). */
export function aggregateCandles(candles, factor) {
  if (factor <= 1) return candles;
  const out = [];
  for (let i = 0; i < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    if (!slice.length) break;
    out.push({
      time: slice[0].time,
      open: slice[0].open,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return out;
}

export const num = (v) => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
