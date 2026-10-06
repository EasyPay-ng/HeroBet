// HeroBet — resting-order monitor + live portfolio valuation.
//
// Keeps a permanent feed subscription to every symbol the account touches
// (open positions + resting orders) so that:
//   1. limit/stop orders trigger the moment the real market trades through them
//   2. the header equity, P&L and margin figures are always marked to market
// It runs for the whole session, independent of which page is open.

import { subscribe, getQuote } from "../market/feed.js";
import { openOrders, state, execute, publishPerformance } from "../backend.js";
import { shouldTrigger, accountSummary } from "./paper.js";
import { toast } from "../ui.js";

let unsub = null;
let watching = "";
let timer = null;
const firing = new Set();

const summaryListeners = new Set();
let lastSummary = null;

export function onPortfolio(cb) {
  summaryListeners.add(cb);
  if (lastSummary) cb(lastSummary);
  return () => summaryListeners.delete(cb);
}

function recompute() {
  const { account, positions } = state();
  if (!account) return;
  const marks = new Map();
  for (const p of positions) marks.set(p.symbol, getQuote(p.symbol)?.price || p.avgPrice);
  const summary = accountSummary(account, positions, marks);
  lastSummary = summary;
  for (const cb of summaryListeners) {
    try {
      cb(summary);
    } catch (e) {
      console.error(e);
    }
  }
  publishPerformance(summary);
}

async function tryTrigger(order, price) {
  if (firing.has(order.id)) return;
  firing.add(order.id);
  try {
    // limit orders fill at their limit (price improvement goes to the trader),
    // stop orders become market orders and fill at the traded price
    const fillPrice = order.type === "limit" ? order.limitPrice : price;
    await execute(order.id, fillPrice);
    toast(
      `${order.type === "limit" ? "Limit" : "Stop"} ${order.side} filled — ${order.qty} ${order.symbol} @ ${fillPrice}`,
      "ok"
    );
  } catch (e) {
    console.warn("trigger failed", e);
  } finally {
    setTimeout(() => firing.delete(order.id), 3000);
  }
}

function onTick(q) {
  for (const o of openOrders()) {
    if (o.symbol !== q.symbol) continue;
    if (shouldTrigger(o, q.price)) tryTrigger(o, q.price);
  }
  recompute();
}

function sync() {
  const { positions } = state();
  const symbols = new Set();
  for (const p of positions) if (p.qty) symbols.add(p.symbol);
  for (const o of openOrders()) symbols.add(o.symbol);

  const key = [...symbols].sort().join(",");
  if (key === watching) {
    recompute();
    return;
  }
  watching = key;
  if (unsub) unsub();
  unsub = symbols.size ? subscribe([...symbols], onTick) : null;
  recompute();
}

export function startOrderMonitor() {
  if (timer) return;
  sync();
  timer = setInterval(sync, 2500);
}

export function stopOrderMonitor() {
  clearInterval(timer);
  timer = null;
  if (unsub) unsub();
  unsub = null;
  watching = "";
}

export function portfolioSummary() {
  return lastSummary;
}
