// HeroBet — paper-engine checks. Run with: npm run test:engine
// Pure arithmetic, no network, no DOM.

import {
  applyTrade,
  checkAffordable,
  accountSummary,
  shouldTrigger,
  maxQty,
  feeFor,
  executionPrice,
  unrealizedPnl,
  SHORT_MARGIN_RATE,
} from "../src/engine/paper.js";

let pass = 0;
let fail = 0;

const near = (a, b, eps = 0.011) => Math.abs(a - b) <= eps;

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

function eq(name, actual, expected, eps) {
  check(name, near(actual, expected, eps), `→ got ${actual}, want ${expected}`);
}

const crypto = { class: "crypto", base: "BTC", qtyStep: 0.00001, pricePrecision: 2 };
const stock = { class: "stock", base: "AAPL", qtyStep: 1, pricePrecision: 2 };
const flat = (symbol = "BTC-USD") => ({ symbol, qty: 0, avgPrice: 0, realized: 0, fees: 0 });

console.log("\nfees & execution");
eq("crypto taker fee is 10bps", feeFor(crypto, 10000), 10);
eq("stocks are commission-free", feeFor(stock, 10000), 0);
eq("market buy lifts the offer", executionPrice(crypto, "buy", { price: 100, ask: 100.5, bid: 99.5 }), 100.5);
eq("market sell hits the bid", executionPrice(crypto, "sell", { price: 100, ask: 100.5, bid: 99.5 }), 99.5);
check(
  "synthetic spread when no book",
  executionPrice(crypto, "buy", { price: 100 }) > 100 && executionPrice(crypto, "sell", { price: 100 }) < 100
);

console.log("\nlong round trip");
{
  let acct = { cash: 100000, reserved: 0 };
  let pos = flat();
  let r = applyTrade(acct, pos, { side: "buy", qty: 2, price: 100, fee: 0.2 });
  eq("cash after buy", r.cash, 100000 - 200 - 0.2);
  eq("position size", r.position.qty, 2);
  eq("avg entry", r.position.avgPrice, 100);
  eq("no margin for longs", r.reserved, 0);

  acct = { cash: r.cash, reserved: r.reserved };
  pos = r.position;
  r = applyTrade(acct, pos, { side: "buy", qty: 2, price: 120, fee: 0.24 });
  eq("avg entry after adding", r.position.avgPrice, 110);
  eq("size after adding", r.position.qty, 4);

  acct = { cash: r.cash, reserved: r.reserved };
  pos = r.position;
  r = applyTrade(acct, pos, { side: "sell", qty: 4, price: 150, fee: 0.6 });
  eq("realised on exit", r.realized, (150 - 110) * 4);
  eq("flat after exit", r.position.qty, 0);
  eq("avg entry cleared", r.position.avgPrice, 0);
  eq("cash back + profit", r.cash, 100000 + 160 - 0.2 - 0.24 - 0.6);
}

console.log("\nshort round trip");
{
  const r = applyTrade({ cash: 100000, reserved: 0 }, flat(), { side: "sell", qty: 1, price: 1000, fee: 1 });
  eq("proceeds credited", r.cash, 100000 + 1000 - 1);
  eq("margin locks proceeds + own collateral", r.reserved, 1000 * (1 + SHORT_MARGIN_RATE));
  eq("buying power drops by the notional", r.cash - r.reserved, 100000 - 1000 - 1);
  eq("short position is negative", r.position.qty, -1);

  const c = applyTrade({ cash: r.cash, reserved: r.reserved }, r.position, {
    side: "buy",
    qty: 1,
    price: 900,
    fee: 0.9,
  });
  eq("realised on cover", c.realized, 100);
  eq("margin released", c.reserved, 0);
  eq("flat after cover", c.position.qty, 0);
  eq("cash reflects the gain", c.cash, 100000 + 100 - 1 - 0.9);
}

console.log("\nflipping sides");
{
  const long = applyTrade({ cash: 100000, reserved: 0 }, flat(), { side: "buy", qty: 1, price: 100, fee: 0 });
  const flipped = applyTrade({ cash: long.cash, reserved: long.reserved }, long.position, {
    side: "sell",
    qty: 3,
    price: 120,
    fee: 0,
  });
  eq("realised on the closed leg only", flipped.realized, 20);
  eq("now short the remainder", flipped.position.qty, -2);
  eq("new entry is the flip price", flipped.position.avgPrice, 120);
  eq("margin on the new short", flipped.reserved, 2 * 120 * (1 + SHORT_MARGIN_RATE));
}

console.log("\nbuying power");
{
  const ok = checkAffordable({ cash: 1000, reserved: 0 }, flat(), crypto, { side: "buy", qty: 9, price: 100 });
  check("affordable order passes", ok.ok === true);
  const bad = checkAffordable({ cash: 1000, reserved: 0 }, flat(), crypto, { side: "buy", qty: 11, price: 100 });
  check("over-spend is rejected", bad.ok === false, JSON.stringify(bad));
  const shortBad = checkAffordable({ cash: 1000, reserved: 0 }, flat(), crypto, { side: "sell", qty: 11, price: 100 });
  check("over-sized short is rejected", shortBad.ok === false);
  const cover = checkAffordable(
    { cash: 2001, reserved: 2000 },
    { symbol: "BTC-USD", qty: -10, avgPrice: 100, realized: 0, fees: 0 },
    crypto,
    { side: "buy", qty: 10, price: 100 }
  );
  check("covering a short is always allowed", cover.ok === true, JSON.stringify(cover));
}

console.log("\nmax size");
{
  const m = maxQty({ cash: 1000, reserved: 0 }, flat(), crypto, "buy", 100);
  check("max buy ≈ 10 units", m > 9.9 && m <= 10, `→ ${m}`);
  const s = maxQty({ cash: 1000, reserved: 0 }, flat(), crypto, "sell", 100);
  check("max short ≈ 5 units (100% margin)", s > 4.9 && s <= 5, `→ ${s}`);
}

console.log("\nportfolio summary");
{
  const account = { cash: 50000, reserved: 2200, deposits: 100000, startingCash: 100000 };
  const positions = [
    { symbol: "BTC-USD", qty: 1, avgPrice: 40000, realized: 500 },
    { symbol: "ETH-USD", qty: -1, avgPrice: 1100, realized: 0 },
  ];
  const marks = new Map([
    ["BTC-USD", 45000],
    ["ETH-USD", 1000],
  ]);
  const s = accountSummary(account, positions, marks);
  eq("positions value nets shorts", s.positionsValue, 45000 - 1000);
  eq("equity", s.equity, 50000 + 44000);
  eq("unrealised", s.unrealized, 5000 + 100);
  eq("realised carried through", s.realized, 500);
  eq("gross exposure", s.grossExposure, 46000);
  eq("net exposure", s.netExposure, 44000);
  eq("total P&L", s.totalPnl, -6000);
  eq("buying power", s.available, 47800);
  eq("unrealised helper agrees", unrealizedPnl(positions[1], 1000), 100);
}

console.log("\norder triggers");
{
  check("buy limit waits for a dip", !shouldTrigger({ type: "limit", side: "buy", limitPrice: 90 }, 95));
  check("buy limit fires at the limit", shouldTrigger({ type: "limit", side: "buy", limitPrice: 90 }, 89.9));
  check("sell limit waits for a rally", !shouldTrigger({ type: "limit", side: "sell", limitPrice: 110 }, 105));
  check("sell limit fires above", shouldTrigger({ type: "limit", side: "sell", limitPrice: 110 }, 110.1));
  check("buy stop fires on a breakout", shouldTrigger({ type: "stop", side: "buy", stopPrice: 110 }, 111));
  check("sell stop fires on a breakdown", shouldTrigger({ type: "stop", side: "sell", stopPrice: 90 }, 89));
  check("market orders never rest", !shouldTrigger({ type: "market", side: "buy" }, 100));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
