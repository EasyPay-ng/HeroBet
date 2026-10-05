// HeroBet — Lobby (football.com-style: hero banner, originals grid, live feed)
import { $, esc, fmtN, fmtMult, timeAgo } from "../ui.js";
import { subscribeRecentBets, currentUser, subscribeWallet } from "../backend.js";

const template = `
<section class="lobby-hero">
  <div class="lh-copy">
    <div class="lh-tag">⚡ HOURLY PROMOTION</div>
    <h1>GIFT DROP</h1>
    <p>₦50,000 day pools · ₦100,000 evening pools — one round every hour, 9:35am to 11:35pm. Rain strikes randomly between :35 and :45.</p>
    <div class="lh-ctas">
      <a class="btn" href="#/promos">How it works</a>
      <a class="btn ghost" href="#/gift-drop">▶ Play the demo</a>
    </div>
  </div>
  <div class="lh-art" aria-hidden="true"></div>
</section>

<section class="sec">
  <div class="sec-head"><h2>HERO ORIGINALS</h2><span class="chip">2 live · more incoming</span></div>
  <div class="games-grid">
    <a class="game-card" href="#/crash">
      <div class="gc-art gc-crash">⚡</div>
      <div class="gc-body">
        <h3>Classic Crash</h3>
        <p>Shared rounds · auto-cashout · Under 1.5 market</p>
      </div>
      <span class="gc-live">● LIVE</span>
    </a>
    <a class="game-card" href="#/dice">
      <div class="gc-art gc-dice">🎲</div>
      <div class="gc-body">
        <h3>Hero Dice</h3>
        <p>Pick your line · 99% RTP · instant rolls</p>
      </div>
      <span class="gc-live">● LIVE</span>
    </a>
    <div class="game-card soon">
      <div class="gc-art gc-mines">🛡️</div>
      <div class="gc-body"><h3>Hero Mines</h3><p>Coming soon</p></div>
      <span class="gc-soon">SOON</span>
    </div>
    <div class="game-card soon">
      <div class="gc-art gc-hilo">🎯</div>
      <div class="gc-body"><h3>Hero Keno</h3><p>Coming soon</p></div>
      <span class="gc-soon">SOON</span>
    </div>
  </div>
</section>

<div class="lobby-cols">
  <section class="sec">
    <div class="sec-head"><h2>LATEST HERO WINS</h2><span class="chip gold">live</span></div>
    <div class="card feed-card"><div id="feedTable" class="live-table"></div></div>
  </section>
  <section class="sec">
    <div class="sec-head"><h2>YOUR WALLET</h2></div>
    <div class="card wallet-card" id="lobbyWallet"></div>
    <div class="card stat-card">
      <div class="stat"><span>Daily rounds</span><strong>15</strong></div>
      <div class="stat"><span>Day pool</span><strong>₦50,000</strong></div>
      <div class="stat"><span>Evening pool</span><strong>₦100,000</strong></div>
      <div class="stat"><span>Winner draw</span><strong>30%</strong></div>
    </div>
  </section>
</div>
`;

function feedRows(bets) {
  if (!bets.length) return `<div class="empty">No bets yet — be the first hero on the board ⚡</div>`;
  return `<table><thead><tr>
    <th>Hero</th><th>Game</th><th class="num">Stake</th><th class="num">Mult</th><th class="num">Payout</th><th></th>
  </tr></thead><tbody>${bets
    .map(
      (b) => `<tr>
      <td>${esc(b.name || "Hero")}</td>
      <td>${b.game === "crash" ? (b.mode === "under15" ? "Crash · U1.5" : "Crash") : "Dice"}</td>
      <td class="num">${fmtN(b.stake)}</td>
      <td class="num">${b.multiplier ? `<span class="win">${fmtMult(b.multiplier)}</span>` : "—"}</td>
      <td class="num">${b.payout ? `<span class="win">${fmtN(b.payout)}</span>` : `<span class="loss">—</span>`}</td>
      <td class="dim">${b.createdAt ? timeAgo(b.createdAt) : ""}</td>
    </tr>`
    )
    .join("")}</tbody></table>`;
}

export const lobbyPage = {
  mount(outlet) {
    outlet.innerHTML = template;
    const feedEl = $("#feedTable");
    const walletEl = $("#lobbyWallet");

    const unFeed = subscribeRecentBets((bets) => {
      feedEl.innerHTML = feedRows(bets.filter((b) => !b.bot).slice(0, 12));
    }, 20);

    let unWallet = null;
    const renderWallet = (w) => {
      if (!currentUser()) {
        walletEl.innerHTML = `
          <p class="dim">Sign in to get your ₦10,000 demo credit and start playing.</p>
          <button class="btn wide" id="lobbySignin">Sign in / Continue as guest</button>`;
        $("#lobbySignin").addEventListener("click", openAuthModal);
        return;
      }
      walletEl.innerHTML = `
        <div class="wallet-big">${w ? fmtN(w.balance) : "—"}</div>
        <p class="dim">Demo balance · simulated NGN</p>
        <a class="btn wide" href="#/wallet">Deposit / Withdraw</a>`;
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
