// HeroBet — prediction market definitions and pool math.
//
// The key business rule for the prediction platform is simple:
// payouts are funded from the market pool, not from the operator's pocket.
// Winners split the escrowed pool after the platform fee. Production should
// replace the demo resolver below with an admin/oracle result signer.

export const POOL_FEE_RATE = 0.07;
export const MIN_PREDICTION_STAKE = 100;
export const MAX_PREDICTION_STAKE = 100000;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function pad(n) {
  return String(n).padStart(2, "0");
}

function localDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ceilTo(ts, stepMs) {
  return Math.ceil((ts + 1000) / stepMs) * stepMs;
}

function nextDaily(hour, minute, minLead = 10 * MIN) {
  const now = Date.now();
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() < now + minLead) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function outcomeFor(market) {
  return market.outcomes[hash32(market.id + ":resolver") % market.outcomes.length].id;
}

function makeMarket(template, closeAt) {
  const dateKey = localDateKey(closeAt);
  const id = `${template.slug}-${dateKey}-${Math.floor(closeAt / MIN)}`;
  const market = {
    ...template,
    id,
    closeAt,
    settlesAt: closeAt + template.settleAfter,
    feeRate: POOL_FEE_RATE,
  };
  market.demoOutcome = outcomeFor(market);
  return market;
}

export function getPredictionMarkets(now = Date.now()) {
  const quarterHour = ceilTo(now + 3 * MIN, 15 * MIN);
  const nextHour = ceilTo(now + 8 * MIN, HOUR);
  const tonight = nextDaily(21, 0);
  const evening = nextDaily(19, 30);

  return [
    makeMarket(
      {
        slug: "quick-sports-pool",
        category: "Sports",
        title: "Featured match: will total goals be 3 or more?",
        description: "A fast-settling pool for the next featured football market. Demo resolver publishes the result after close.",
        badge: "Fast pool",
        settleAfter: 4 * MIN,
        liquidity: { yes: 18400, no: 15100 },
        outcomes: [
          { id: "yes", label: "Yes, 3+ goals", short: "Yes" },
          { id: "no", label: "No, under 3 goals", short: "No" },
        ],
      },
      quarterHour
    ),
    makeMarket(
      {
        slug: "hourly-naira-pool",
        category: "Finance",
        title: "USD/NGN demo rate: closes above the line?",
        description: "Players back Above or Below. Winners share the opposite side's stake minus the platform fee.",
        badge: "Hourly",
        settleAfter: 5 * MIN,
        liquidity: { above: 22000, below: 17600 },
        outcomes: [
          { id: "above", label: "Above the line", short: "Above" },
          { id: "below", label: "Below the line", short: "Below" },
        ],
      },
      nextHour
    ),
    makeMarket(
      {
        slug: "lagos-rain-pool",
        category: "Weather",
        title: "Will Lagos record rain before 8pm?",
        description: "A daily yes/no pool. In production this should settle from a trusted weather oracle.",
        badge: "Daily",
        settleAfter: 15 * MIN,
        liquidity: { rain: 26300, dry: 19400 },
        outcomes: [
          { id: "rain", label: "Rain before 8pm", short: "Rain" },
          { id: "dry", label: "No rain before 8pm", short: "Dry" },
        ],
      },
      evening
    ),
    makeMarket(
      {
        slug: "derby-winner-pool",
        category: "Sports",
        title: "Lagos Derby demo: who wins?",
        description: "Three-way prediction pool. No fixed odds; prices move as the community stakes change.",
        badge: "3-way",
        settleAfter: 20 * MIN,
        liquidity: { mainland: 31500, draw: 14200, island: 27800 },
        outcomes: [
          { id: "mainland", label: "Mainland Heroes", short: "Mainland" },
          { id: "draw", label: "Draw", short: "Draw" },
          { id: "island", label: "Island Titans", short: "Island" },
        ],
      },
      tonight
    ),
  ];
}

export function emptyTotals(market) {
  return Object.fromEntries(market.outcomes.map((o) => [o.id, market.liquidity?.[o.id] || 0]));
}

export function poolTotals(market, bets = []) {
  const byOutcome = emptyTotals(market);
  for (const bet of bets) {
    if (bet.status !== "placed" && bet.status !== "won" && bet.status !== "lost") continue;
    const key = bet.outcome || bet.side || bet.mode;
    if (key in byOutcome) byOutcome[key] += Number(bet.stake || 0);
  }
  const total = Object.values(byOutcome).reduce((sum, value) => sum + value, 0);
  const fee = Math.round(total * (market.feeRate ?? POOL_FEE_RATE));
  const distributable = Math.max(0, total - fee);
  return { byOutcome, total, fee, distributable };
}

export function estimatePayout(market, bets, outcomeId, stake) {
  const s = Math.max(0, Number(stake || 0));
  const totals = poolTotals(market, bets);
  const totalAfter = totals.total + s;
  const sideAfter = (totals.byOutcome[outcomeId] || 0) + s;
  if (!s || !sideAfter) return { payout: 0, multiplier: 0 };
  const distributable = Math.max(0, Math.round(totalAfter * (1 - (market.feeRate ?? POOL_FEE_RATE))));
  const payout = Math.floor(distributable * (s / sideAfter));
  return { payout, multiplier: payout / s };
}

export function settlementForBet(market, bets, bet) {
  const totals = poolTotals(market, bets);
  const winningPool = totals.byOutcome[market.demoOutcome] || 0;
  const won = (bet.outcome || bet.side || bet.mode) === market.demoOutcome;
  const payout = won && winningPool > 0 ? Math.floor(totals.distributable * (Number(bet.stake || 0) / winningPool)) : 0;
  return { won, payout, totals };
}

export function marketStatus(market, now = Date.now()) {
  if (now < market.closeAt) return "open";
  if (now < market.settlesAt) return "closed";
  return "settled";
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(sec)}s`;
}
