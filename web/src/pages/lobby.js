// HeroBet — Dashboard for the peer-to-peer prediction platform.
import { $, esc, fmtN, timeAgo } from "../ui.js";
import { subscribeRecentBets, currentUser, subscribeWallet } from "../backend.js";
import { openAuthModal } from "../auth-ui.js";
import { getPredictionMarkets, poolTotals, marketStatus, formatCountdown, POOL_FEE_RATE } from "../prediction-markets.js";

function template(markets) {
  const previewCards = markets
    .slice(0, 3)
    .map((market) => {
      const totals = poolTotals(market, []);
      const status = marketStatus(market);
      const lead = status === "open" ? `Closes in ${formatCountdown(market.closeAt - Date.now())}` : "Closed";
      return `<a class="game-card market-preview" href="#/predictions">
        <div class="gc-art gc-crash">${market.category === "Sports" ? "⚽" : market.category === "Finance" ? "₦" : "☁️"}</div>
        <div class="gc-body">
          <h3>${esc(market.title)}</h3>
          <p>${esc(market.category)} · Pool ${fmtN(totals.total)} · ${lead}</p>
        </div>
        <span class="gc-live">● OPEN</span>
      </a>`;
    })
    .join("");

  return `
<section class="lobby-hero">
  <div class="lh-copy">
    <div class="lh-tag">⚡ POOL-FUNDED PREDICTIONS</div>
    <h1>BET ON OUTCOMES, NOT THE HOUSE</h1>
    <p>HeroBet is now structured as prediction pools: players back outcomes, stakes are escrowed into the pool, and winners share that pool after a small platform fee. You are not promising fixed payouts from your own pocket.</p>
    <div class="lh-ctas">
      <a class="btn" href="#/predictions">Browse prediction pools</a>
      <a class="btn ghost" href="#/promos">See payout rules</a>
    </div>
  </div>
  <div class="lh-art" aria-hidden="true"></div>
</section>

<section class="sec">
  <div class="sec-head"><h2>LIVE PREDICTION POOLS</h2><span class="chip">${markets.length} markets · demo liquidity</span></div>
  <div class="games-grid">
    ${previewCards}
    <a class="game-card" href="#/predictions">
      <div class="gc-art gc-dice">🔮</div>
      <div class="gc-body">
        <h3>All Markets</h3>
        <p>Sports, finance, weather and custom admin-settled pools</p>
      </div>
      <span class="gc-live">VIEW</span>
    </a>
  </div>
</section>

<div class="lobby-cols">
  <section class="sec">
    <div class="sec-head"><h2>LATEST POOL ACTIVITY</h2><span class="chip gold">live</span></div>
    <div class="card feed-card"><div id="feedTable" class="live-table"></div></div>
  </section>
  <section class="sec">
    <div class="sec-head"><h2>YOUR WALLET</h2></div>
    <div class="card wallet-card" id="lobbyWallet"></div>
    <div class="card stat-card">
      <div class="stat"><span>Payout source</span><strong>Pool</strong></div>
      <div class="stat"><span>House risk</span><strong>₦0</strong></div>
      <div class="stat"><span>Platform fee</span><strong>${Math.round(POOL_FEE_RATE * 100)}%</strong></div>
      <div class="stat"><span>Odds style</span><strong>Shared</strong></div>
    </div>
  </section>
</div>
`;
}

function labelForBet(b) {
  if (b.game === "prediction") return `Prediction · ${b.outcome || b.mode}`;
  if (b.game === "crash") return b.mode === "under15" ? "Crash · U1.5 demo" : "Crash demo";
  if (b.game === "dice") return "Dice demo";
  return b.game || "Bet";
}

function feedRows(bets) {
  if (!bets.length) return `<div class="empty">No pool tickets yet — open a prediction market and be first on the board.</div>`;
  return `<table><thead><tr>
    <th>Hero</th><th>Market</th><th class="num">Stake</th><th class="num">Payout</th><th>Status</th><th></th>
  </tr></thead><tbody>${bets
    .map(
      (b) => `<tr>
      <td>${esc(b.name || "Hero")}</td>
      <td>${esc(b.marketTitle || labelForBet(b))}</td>
      <td class="num">${fmtN(b.stake)}</td>
      <td class="num">${b.payout ? `<span class="win">${fmtN(b.payout)}</span>` : "—"}</td>
      <td class="dim">${esc(b.status || "placed")}</td>
      <td class="dim">${b.createdAt ? timeAgo(b.createdAt) : ""}</td>
    </tr>`
    )
    .join("")}</tbody></table>`;
}

export const lobbyPage = {
  mount(outlet) {
    const markets = getPredictionMarkets();
    outlet.innerHTML = template(markets);
    const feedEl = $("#feedTable");
    const walletEl = $("#lobbyWallet");

    const unFeed = subscribeRecentBets((bets) => {
      feedEl.innerHTML = feedRows(bets.filter((b) => !b.bot).slice(0, 12));
    }, 20);

    let unWallet = null;
    const renderWallet = (w) => {
      if (!currentUser()) {
        walletEl.innerHTML = `
          <p class="dim">Sign in to get your ₦10,000 demo credit and test pool tickets.</p>
          <button class="btn wide" id="lobbySignin">Sign in / Continue as guest</button>`;
        $("#lobbySignin").addEventListener("click", openAuthModal);
        return;
      }
      walletEl.innerHTML = `
        <div class="wallet-big">${w ? fmtN(w.balance) : "—"}</div>
        <p class="dim">Demo balance · simulated NGN</p>
        <a class="btn wide" href="#/wallet">Open wallet</a>`;
    };
    renderWallet(null);
    unWallet = subscribeWallet(renderWallet);

    return {
      destroy() {
        unFeed && unFeed();
        unWallet && unWallet();
      },
    };
  },
};
