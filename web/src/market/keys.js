// HeroBet — market-data provider API keys.
//
// Crypto and FX work with ZERO keys (public exchange + central-bank endpoints).
// US stocks need a free key from one of the supported vendors. Keys are stored
// in this browser only (localStorage) and are never written to Firestore, so a
// user can paste their own key at runtime via Settings without a rebuild.
// A build-time default can also be supplied with Vite env vars.

const LS_KEY = "hb_data_keys_v1";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const VENDORS = {
  twelvedata: {
    id: "twelvedata",
    label: "Twelve Data",
    url: "https://twelvedata.com/pricing",
    covers: "Stocks + forex quotes & candles",
    free: "800 requests/day free",
    envKey: "VITE_TWELVEDATA_KEY",
  },
  finnhub: {
    id: "finnhub",
    label: "Finnhub",
    url: "https://finnhub.io/register",
    covers: "Real-time US stock quotes",
    free: "60 requests/min free",
    envKey: "VITE_FINNHUB_KEY",
  },
  alphavantage: {
    id: "alphavantage",
    label: "Alpha Vantage",
    url: "https://www.alphavantage.co/support/#api-key",
    covers: "Stock quotes & candles (slow tier)",
    free: "25 requests/day free",
    envKey: "VITE_ALPHAVANTAGE_KEY",
  },
};

function read() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}

function write(obj) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("hb:keys-changed"));
}

export function getKey(vendor) {
  const stored = read()[vendor];
  if (stored) return stored;
  const env = VENDORS[vendor]?.envKey;
  return (env && ENV[env]) || "";
}

export function setKey(vendor, value) {
  const all = read();
  const v = String(value || "").trim();
  if (v) all[vendor] = v;
  else delete all[vendor];
  write(all);
}

export function allKeys() {
  return Object.fromEntries(Object.keys(VENDORS).map((v) => [v, getKey(v)]));
}

/** Which vendor (if any) can serve stock data right now. */
export function stockVendor() {
  if (getKey("twelvedata")) return "twelvedata";
  if (getKey("finnhub")) return "finnhub";
  if (getKey("alphavantage")) return "alphavantage";
  return null;
}

/** Twelve Data also serves intraday FX; otherwise we use keyless daily rates. */
export function fxVendor() {
  return getKey("twelvedata") ? "twelvedata" : null;
}

export function onKeysChanged(cb) {
  const h = () => cb(allKeys());
  window.addEventListener("hb:keys-changed", h);
  return () => window.removeEventListener("hb:keys-changed", h);
}
