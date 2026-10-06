// HeroBet — headless UI + data-layer smoke test.
//
// Boots every page inside jsdom through Vite's module loader, with the Firebase
// SDK and the charting library stubbed out, so we exercise:
//   • each page's mount() / destroy() against a real DOM
//   • the local-storage fallback backend end to end (order → fill → position)
// Network is hard-blocked, so this also proves the UI degrades cleanly when no
// market-data venue is reachable.
//
// Run with: npm run test:pages

import { createServer } from "vite";
import { JSDOM } from "jsdom";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const stub = (f) => resolve(here, "stubs", f);

let pass = 0;
let fail = 0;
const errors = [];

const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name} ${extra}`);
  }
};

// ─────────────── jsdom environment ───────────────
const dom = new JSDOM(
  `<!doctype html><html><body>
     <header class="topbar"><span id="modeChip"></span><div id="authArea"></div><a id="equityChip"></a></header>
     <div id="setupBanner" hidden></div>
     <main id="outlet"></main>
     <div id="toasts"></div><div id="modalRoot"></div>
   </body></html>`,
  { url: "https://herobet.test/", pretendToBeVisual: true }
);

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.sessionStorage = window.sessionStorage;
globalThis.localStorage = window.localStorage;

// Hard-block the network: every venue must look unreachable.
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls++;
  throw new Error("NETWORK_BLOCKED " + String(url).slice(0, 60));
};
class FakeSocket {
  constructor() {
    this.readyState = 3;
    setTimeout(() => this.onclose && this.onclose({}), 0);
  }
  addEventListener() {}
  send() {}
  close() {}
}
globalThis.WebSocket = FakeSocket;

window.addEventListener("error", (e) => errors.push("window error: " + e.message));
const origError = console.error;
console.error = (...a) => {
  const msg = a.map(String).join(" ");
  // expected: feed listeners reporting that every venue is unreachable
  if (!/NETWORK_BLOCKED|unreachable|ALL_HOSTS_FAILED|STUB_OFFLINE/.test(msg)) errors.push(msg);
  origError("    · " + msg.slice(0, 160));
};

// ─────────────── vite loader ───────────────
const server = await createServer({
  configFile: false,
  root: resolve(here, ".."),
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: stub("firebase-app.js") },
      { find: /^firebase\/auth$/, replacement: stub("firebase-auth.js") },
      { find: /^firebase\/firestore$/, replacement: stub("firebase-firestore.js") },
      { find: /^lightweight-charts$/, replacement: stub("lightweight-charts.js") },
    ],
  },
  ssr: { noExternal: true },
});

const load = (p) => server.ssrLoadModule(p);

// ─────────────── backend in local mode ───────────────
console.log("\nbackend (local fallback)");
const backend = await load("/src/backend.js");
const initStatus = await backend.initBackend();
check("falls back to local mode when Firestore is unreachable", initStatus.mode === "local", JSON.stringify(initStatus));

let authUser = null;
backend.onAuth((u) => (authUser = u));
check("auto-creates a local trader", !!authUser && !!authUser.uid);

let account = null;
backend.subscribeAccount((a) => (account = a));
check("opens with $100,000 paper capital", account?.cash === 100000, `→ ${account?.cash}`);

console.log("\ntrade lifecycle");
const quote = { symbol: "BTC-USD", price: 50000, bid: 49995, ask: 50005, execPrice: 50005, changePct: 1 };
const placed = await backend.placeOrder({ symbol: "BTC-USD", side: "buy", type: "market", qty: 1 }, quote);
check("market order fills immediately", placed.status === "filled", JSON.stringify(placed));

let positions = [];
backend.subscribePositions((p) => (positions = p));
const pos = positions.find((p) => p.symbol === "BTC-USD");
check("position opened", pos?.qty === 1, JSON.stringify(pos));
check("entry is the execution price", pos?.avgPrice === 50005, `→ ${pos?.avgPrice}`);
check(
  "cash debited including the 10bps fee",
  Math.abs(account.cash - (100000 - 50005 - 50.005)) < 0.02,
  `→ ${account?.cash}`
);

let ledger = [];
backend.subscribeLedger((l) => (ledger = l));
check("ledger journalled the buy", ledger[0]?.type === "buy" && ledger[0]?.balanceAfter === account.cash);

let fills = [];
backend.subscribeFills((f) => (fills = f));
check("execution recorded", fills.length === 1 && fills[0].qty === 1);

const sellQuote = { ...quote, price: 55000, bid: 54995, ask: 55005, execPrice: 54995 };
await backend.placeOrder({ symbol: "BTC-USD", side: "sell", type: "market", qty: 1 }, sellQuote);
backend.subscribePositions((p) => (positions = p));
check("position closed out", !positions.find((p) => p.symbol === "BTC-USD" && p.qty));
check("profit landed in cash", account.cash > 104000, `→ ${account.cash}`);

const resting = await backend.placeOrder(
  { symbol: "ETH-USD", side: "buy", type: "limit", qty: 1, limitPrice: 1000 },
  { symbol: "ETH-USD", price: 3000 }
);
check("limit order rests", resting.status === "open");
check("open-order cache sees it", backend.openOrders().length === 1);
await backend.cancelOrder(resting.id);
check("cancel works", backend.openOrders().length === 0);

let rejected = null;
try {
  await backend.placeOrder({ symbol: "BTC-USD", side: "buy", type: "market", qty: 1000 }, quote);
} catch (e) {
  rejected = e.message;
}
check("over-sized order is refused", /buying power/i.test(rejected || ""), `→ ${rejected}`);

// ─────────────── market feed with every venue down ───────────────
console.log("\nmarket feed (all venues blocked)");
const feed = await load("/src/market/feed.js");
await feed.startFeed();
check("probed the venues", fetchCalls > 0, `→ ${fetchCalls} requests attempted`);
check("reports crypto as down instead of faking prices", feed.status.crypto.ok === false);
check("reports stocks as locked without a key", feed.status.stock.transport === "locked");
check("no quote is invented", feed.getQuote("BTC-USD") === null);

// ─────────────── pages ───────────────
console.log("\npage mount / destroy");
const outlet = document.getElementById("outlet");
const pages = [
  ["dashboard", "/src/pages/dashboard.js", "dashboardPage", {}],
  ["markets", "/src/pages/markets.js", "marketsPage", {}],
  ["trade", "/src/pages/trade.js", "tradePage", { symbol: "BTC-USD" }],
  ["trade (fx symbol)", "/src/pages/trade.js", "tradePage", { symbol: "EUR/USD" }],
  ["trade (unknown)", "/src/pages/trade.js", "tradePage", { symbol: "NOPE-USD" }],
  ["portfolio", "/src/pages/portfolio.js", "portfolioPage", {}],
  ["orders", "/src/pages/orders.js", "ordersPage", {}],
  ["wallet", "/src/pages/wallet.js", "walletPage", {}],
  ["settings", "/src/pages/settings.js", "settingsPage", {}],
  ["about", "/src/pages/about.js", "aboutPage", {}],
];

for (const [name, path, exp, params] of pages) {
  const before = errors.length;
  let handle = null;
  try {
    const mod = await load(path);
    outlet.innerHTML = "";
    handle = mod[exp].mount(outlet, params);
    await new Promise((r) => setTimeout(r, 90));
    const rendered = outlet.innerHTML.length > 150;
    check(`${name} renders`, rendered && errors.length === before, errors.slice(before).join(" | "));
    handle?.destroy?.();
  } catch (e) {
    check(`${name} renders`, false, e.stack?.split("\n").slice(0, 3).join(" "));
  }
}

// ─────────────── router ───────────────
console.log("\nrouter");
const router = await load("/src/router.js");
check("encodes FX symbols into the hash", router.tradeHref("EUR/USD") === "#/trade/EUR%2FUSD");
check("encodes crypto symbols", router.tradeHref("BTC-USD") === "#/trade/BTC-USD");

await server.close();

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) {
  console.log(`\nunexpected console errors (${errors.length}):`);
  errors.slice(0, 10).forEach((e) => console.log("  - " + e.slice(0, 200)));
}
process.exit(fail ? 1 : 0);
