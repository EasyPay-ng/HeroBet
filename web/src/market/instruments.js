// HeroBet — tradable instrument universe.
// Every instrument is a REAL market symbol; prices come from live public
// market-data APIs (see ./feed.js). Nothing here is invented.

export const ASSET_CLASS = {
  crypto: { id: "crypto", label: "Crypto", icon: "₿", note: "24/7 · live tick data" },
  stock: { id: "stock", label: "Stocks", icon: "▦", note: "US equities · needs a data key" },
  fx: { id: "fx", label: "Forex", icon: "⇄", note: "Currency pairs" },
};

/** @param {string} base @param {string} name */
const C = (base, name, pricePrecision, qtyStep, cg) => ({
  symbol: `${base}-USD`,
  class: "crypto",
  base,
  quote: "USD",
  name,
  pricePrecision,
  qtyStep,
  minQty: qtyStep,
  cg, // CoinGecko id (last-resort provider)
});

const S = (ticker, name, sector) => ({
  symbol: ticker,
  class: "stock",
  base: ticker,
  quote: "USD",
  name,
  sector,
  pricePrecision: 2,
  qtyStep: 1,
  minQty: 1,
});

const F = (base, quote, name, pricePrecision = 4) => ({
  symbol: `${base}/${quote}`,
  class: "fx",
  base,
  quote,
  name,
  pricePrecision,
  qtyStep: 1,
  minQty: 1,
});

export const CRYPTO = [
  C("BTC", "Bitcoin", 2, 0.00001, "bitcoin"),
  C("ETH", "Ethereum", 2, 0.0001, "ethereum"),
  C("SOL", "Solana", 2, 0.001, "solana"),
  C("BNB", "BNB", 2, 0.001, "binancecoin"),
  C("XRP", "XRP", 4, 1, "ripple"),
  C("ADA", "Cardano", 4, 1, "cardano"),
  C("DOGE", "Dogecoin", 5, 1, "dogecoin"),
  C("AVAX", "Avalanche", 3, 0.01, "avalanche-2"),
  C("LINK", "Chainlink", 3, 0.01, "chainlink"),
  C("DOT", "Polkadot", 3, 0.01, "polkadot"),
  C("TRX", "TRON", 5, 1, "tron"),
  C("LTC", "Litecoin", 2, 0.001, "litecoin"),
  C("BCH", "Bitcoin Cash", 2, 0.001, "bitcoin-cash"),
  C("UNI", "Uniswap", 3, 0.01, "uniswap"),
  C("ATOM", "Cosmos", 3, 0.01, "cosmos"),
  C("ETC", "Ethereum Classic", 3, 0.01, "ethereum-classic"),
  C("FIL", "Filecoin", 3, 0.01, "filecoin"),
  C("NEAR", "NEAR Protocol", 3, 0.01, "near"),
  C("APT", "Aptos", 3, 0.01, "aptos"),
  C("ARB", "Arbitrum", 4, 0.1, "arbitrum"),
  C("OP", "Optimism", 4, 0.1, "optimism"),
  C("SUI", "Sui", 4, 0.1, "sui"),
  C("INJ", "Injective", 3, 0.01, "injective-protocol"),
  C("SHIB", "Shiba Inu", 8, 100000, "shiba-inu"),
  C("PEPE", "Pepe", 8, 100000, "pepe"),
  C("HBAR", "Hedera", 5, 1, "hedera-hashgraph"),
];

export const STOCKS = [
  S("AAPL", "Apple Inc.", "Technology"),
  S("MSFT", "Microsoft Corp.", "Technology"),
  S("NVDA", "NVIDIA Corp.", "Semiconductors"),
  S("AMZN", "Amazon.com Inc.", "Consumer"),
  S("GOOGL", "Alphabet Inc.", "Technology"),
  S("META", "Meta Platforms", "Technology"),
  S("TSLA", "Tesla Inc.", "Automotive"),
  S("AMD", "Advanced Micro Devices", "Semiconductors"),
  S("NFLX", "Netflix Inc.", "Media"),
  S("JPM", "JPMorgan Chase", "Financials"),
  S("V", "Visa Inc.", "Financials"),
  S("DIS", "Walt Disney Co.", "Media"),
  S("KO", "Coca-Cola Co.", "Consumer"),
  S("BA", "Boeing Co.", "Industrials"),
  S("INTC", "Intel Corp.", "Semiconductors"),
  S("UBER", "Uber Technologies", "Technology"),
  S("COIN", "Coinbase Global", "Financials"),
  S("PLTR", "Palantir Technologies", "Technology"),
  S("SPY", "SPDR S&P 500 ETF", "Index ETF"),
  S("QQQ", "Invesco QQQ Trust", "Index ETF"),
];

export const FX = [
  F("EUR", "USD", "Euro / US Dollar"),
  F("GBP", "USD", "British Pound / US Dollar"),
  F("USD", "JPY", "US Dollar / Japanese Yen", 3),
  F("USD", "NGN", "US Dollar / Nigerian Naira", 2),
  F("EUR", "NGN", "Euro / Nigerian Naira", 2),
  F("GBP", "NGN", "British Pound / Nigerian Naira", 2),
  F("USD", "ZAR", "US Dollar / South African Rand", 3),
  F("USD", "GHS", "US Dollar / Ghanaian Cedi", 3),
  F("USD", "KES", "US Dollar / Kenyan Shilling", 2),
  F("AUD", "USD", "Australian Dollar / US Dollar"),
  F("USD", "CAD", "US Dollar / Canadian Dollar"),
  F("USD", "CHF", "US Dollar / Swiss Franc"),
  F("USD", "CNY", "US Dollar / Chinese Yuan", 3),
  F("USD", "INR", "US Dollar / Indian Rupee", 3),
  F("EUR", "GBP", "Euro / British Pound"),
];

export const INSTRUMENTS = [...CRYPTO, ...STOCKS, ...FX];

const INDEX = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));

export function instrument(symbol) {
  return INDEX.get(symbol) || null;
}

export function listByClass(cls) {
  return cls === "all" || !cls ? INSTRUMENTS : INSTRUMENTS.filter((i) => i.class === cls);
}

export function searchInstruments(term, cls = "all") {
  const q = String(term || "").trim().toLowerCase();
  const pool = listByClass(cls);
  if (!q) return pool;
  return pool.filter(
    (i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.base.toLowerCase().includes(q)
  );
}

export const DEFAULT_WATCHLIST = ["BTC-USD", "ETH-USD", "SOL-USD", "NVDA", "AAPL", "USD/NGN", "EUR/USD"];

/** Round a quantity down to the instrument's lot step. */
export function roundQty(inst, qty) {
  const step = inst?.qtyStep || 0.00000001;
  const n = Math.floor(Number(qty) / step + 1e-9) * step;
  // kill float dust (0.30000000000000004)
  const dp = Math.max(0, Math.ceil(-Math.log10(step)) + 2);
  return Number(n.toFixed(dp));
}

/** Format a price with the instrument's precision. */
export function fmtPrice(inst, price) {
  if (price === null || price === undefined || !isFinite(price)) return "—";
  const dp = inst?.pricePrecision ?? 2;
  return Number(price).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
