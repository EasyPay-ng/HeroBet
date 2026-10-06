// HeroBet — paper-trading accounting engine.
//
// Pure functions, no I/O: everything here is unit-testable and is exercised by
// `npm run test:engine`. Real prices in, real double-entry style accounting out.
//
// Account model
//   cash      settled cash (USD)
//   reserved  margin locked by open short positions
//   available = cash - reserved   ← what you can actually spend
//   equity    = cash + Σ qty·mark ← shorts carry negative market value
//
// Shorting locks the sale proceeds *plus* an equal amount of your own cash
// (100% initial margin), so a $1,000 short ties up exactly as much buying power
// as a $1,000 purchase. No leverage, no liquidation engine, no surprises.

export const SHORT_MARGIN_RATE = 1; // own collateral required, as a fraction of notional

/** Taker fee in basis points, by asset class. */
export const FEE_BPS = { crypto: 10, stock: 0, fx: 1 };
/** Half-spread applied when we only have a last price, in basis points. */
export const SPREAD_BPS = { crypto: 2, stock: 1, fx: 2 };

export const EPS = 1e-9;

export function feeFor(inst, notional) {
  const bps = FEE_BPS[inst?.class] ?? 10;
  return Math.max(0, (notional * bps) / 10000);
}

/**
 * The price a market order would actually execute at.
 * Uses the real book's bid/ask when the venue gives us one, otherwise applies
 * a small synthetic half-spread to the last trade price.
 */
export function executionPrice(inst, side, quote) {
  if (!quote || !quote.price) return 0;
  const bps = SPREAD_BPS[inst?.class] ?? 2;
  if (side === "buy") {
    if (quote.ask && quote.ask >= quote.price) return quote.ask;
    return quote.price * (1 + bps / 10000);
  }
  if (quote.bid && quote.bid > 0 && quote.bid <= quote.price) return quote.bid;
  return quote.price * (1 - bps / 10000);
}

/** Current state of a position. */
export function emptyPosition(symbol) {
  return { symbol, qty: 0, avgPrice: 0, realized: 0, fees: 0 };
}

export function positionValue(pos, mark) {
  return (pos?.qty || 0) * (mark || 0);
}

export function unrealizedPnl(pos, mark) {
  if (!pos || !pos.qty || !mark) return 0;
  return (mark - pos.avgPrice) * pos.qty;
}

export function unrealizedPct(pos, mark) {
  if (!pos || !pos.qty || !pos.avgPrice || !mark) return 0;
  const dir = pos.qty > 0 ? 1 : -1;
  return ((mark - pos.avgPrice) / pos.avgPrice) * 100 * dir;
}

/** Margin currently locked by a (short) position. */
export function positionMargin(pos) {
  if (!pos || pos.qty >= 0) return 0;
  return Math.abs(pos.qty) * pos.avgPrice * (1 + SHORT_MARGIN_RATE);
}

/**
 * Apply a fill to {cash, reserved} + a position. Returns the new state.
 * This is the single source of truth for how money moves.
 */
export function applyTrade(state, pos, { side, qty, price, fee = 0 }) {
  const cashBefore = state.cash;
  let cash = state.cash;
  let reserved = state.reserved || 0;

  const q = Math.abs(Number(qty));
  const p = Number(price);
  const signed = side === "buy" ? q : -q;

  cash += (side === "buy" ? -1 : 1) * q * p;
  cash -= fee;

  const prevQty = pos?.qty || 0;
  const prevAvg = pos?.avgPrice || 0;
  let realized = 0;
  let newQty = prevQty + signed;
  let newAvg = prevAvg;

  if (Math.abs(prevQty) < EPS) {
    newAvg = p;
    if (signed < 0) reserved += q * p * (1 + SHORT_MARGIN_RATE);
  } else if (Math.sign(prevQty) === Math.sign(signed)) {
    // adding to the position — weighted average entry
    newAvg = (Math.abs(prevQty) * prevAvg + q * p) / Math.abs(newQty);
    if (signed < 0) reserved += q * p * (1 + SHORT_MARGIN_RATE);
  } else {
    // reducing, closing, or flipping
    const closing = Math.min(q, Math.abs(prevQty));
    realized = prevQty > 0 ? (p - prevAvg) * closing : (prevAvg - p) * closing;
    if (prevQty < 0) reserved -= closing * prevAvg * (1 + SHORT_MARGIN_RATE);
    const remaining = q - closing;
    if (Math.abs(newQty) < EPS) {
      newQty = 0;
      newAvg = 0;
    } else if (Math.sign(newQty) !== Math.sign(prevQty)) {
      newAvg = p; // flipped side
      if (newQty < 0) reserved += remaining * p * (1 + SHORT_MARGIN_RATE);
    }
  }

  if (reserved < EPS) reserved = 0;

  return {
    cash: round2(cash),
    reserved: round2(reserved),
    cashDelta: round2(cash - cashBefore),
    realized: round2(realized),
    position: {
      symbol: pos?.symbol,
      qty: cleanQty(newQty),
      avgPrice: newQty === 0 ? 0 : round8(newAvg),
      realized: round2((pos?.realized || 0) + realized),
      fees: round2((pos?.fees || 0) + fee),
    },
  };
}

/**
 * Can this order be afforded? Simulates the fill and checks buying power.
 * @returns {{ok:boolean, reason?:string, cost:number, fee:number, after:object}}
 */
export function checkAffordable(state, pos, inst, { side, qty, price }) {
  const notional = Math.abs(qty) * price;
  const fee = feeFor(inst, notional);
  const after = applyTrade(state, pos, { side, qty, price, fee });
  const available = after.cash - after.reserved;
  if (available < -0.005) {
    return {
      ok: false,
      reason: "Not enough buying power",
      cost: notional + fee,
      fee,
      after,
      shortfall: Math.abs(available),
    };
  }
  return { ok: true, cost: notional + fee, fee, after };
}

/** Portfolio-level numbers. `marks` is a Map or object of symbol → price. */
export function accountSummary(account, positions, marks) {
  const get = (s) => (marks instanceof Map ? marks.get(s) : marks?.[s]) || 0;
  let positionsValue = 0;
  let unrealized = 0;
  let longExposure = 0;
  let shortExposure = 0;
  let realized = 0;

  for (const pos of positions) {
    if (!pos.qty) {
      realized += pos.realized || 0;
      continue;
    }
    const mark = get(pos.symbol) || pos.avgPrice;
    const val = pos.qty * mark;
    positionsValue += val;
    unrealized += unrealizedPnl(pos, mark);
    realized += pos.realized || 0;
    if (pos.qty > 0) longExposure += val;
    else shortExposure += Math.abs(val);
  }

  const cash = account?.cash || 0;
  const reserved = account?.reserved || 0;
  const equity = cash + positionsValue;
  const starting = account?.startingCash || 0;
  const deposits = account?.deposits ?? starting;

  return {
    cash: round2(cash),
    reserved: round2(reserved),
    available: round2(cash - reserved),
    positionsValue: round2(positionsValue),
    unrealized: round2(unrealized),
    realized: round2(realized),
    equity: round2(equity),
    longExposure: round2(longExposure),
    shortExposure: round2(shortExposure),
    netExposure: round2(longExposure - shortExposure),
    grossExposure: round2(longExposure + shortExposure),
    deposits: round2(deposits),
    totalPnl: round2(equity - deposits),
    totalPnlPct: deposits ? round2(((equity - deposits) / deposits) * 100) : 0,
  };
}

/** Should a resting order trigger at this price? */
export function shouldTrigger(order, price) {
  if (!price) return false;
  if (order.type === "limit") {
    return order.side === "buy" ? price <= order.limitPrice + EPS : price >= order.limitPrice - EPS;
  }
  if (order.type === "stop") {
    return order.side === "buy" ? price >= order.stopPrice - EPS : price <= order.stopPrice + EPS;
  }
  return false;
}

/** Max quantity affordable at a price, respecting the lot step. */
export function maxQty(state, pos, inst, side, price) {
  if (!price) return 0;
  const available = Math.max(0, (state.cash || 0) - (state.reserved || 0));
  const feeMul = 1 + (FEE_BPS[inst?.class] ?? 10) / 10000;
  const prevQty = pos?.qty || 0;

  // closing an opposing position frees margin, so allow at least the full close
  let closable = 0;
  if ((side === "buy" && prevQty < 0) || (side === "sell" && prevQty > 0)) closable = Math.abs(prevQty);

  const opening = available / (price * feeMul * (side === "sell" && prevQty >= 0 ? 1 + SHORT_MARGIN_RATE : 1));
  return Math.max(0, closable + Math.max(0, opening));
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round8 = (n) => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const cleanQty = (n) => (Math.abs(n) < 1e-10 ? 0 : round8(n));
