// HeroBet — Pool rules / operator-risk explanation.
const template = `
<section class="page-head">
  <div>
    <h1>POOL RULES</h1>
    <p class="sub">How HeroBet can run prediction markets without paying winnings out of pocket</p>
  </div>
</section>

<section class="card promo-hero">
  <div class="promo-badge">⚡ PEER-TO-PEER MODEL</div>
  <h2>WINNERS SHARE THE POOL</h2>
  <p class="promo-tag">No fixed house odds · no operator-funded jackpot · transparent fee.</p>
  <div class="promo-grid">
    <div>
      <h3>1. Stakes are escrowed</h3>
      <ul>
        <li>Every prediction ticket moves the player's stake into that market pool.</li>
        <li>The visible pool total is the source of future payouts.</li>
        <li>HeroBet does not promise a payout larger than the pool can cover.</li>
        <li>Demo mode uses simulated NGN and seeded community liquidity for testing.</li>
      </ul>
    </div>
    <div>
      <h3>2. Results are resolved</h3>
      <ul>
        <li>Markets close before settlement so no one can bet after the result is known.</li>
        <li>The demo resolver picks an outcome automatically for testing.</li>
        <li>Production should use an admin/oracle result signer and Cloud Functions.</li>
        <li>Disputed/void market handling can refund stakes from escrow.</li>
      </ul>
    </div>
    <div>
      <h3>3. Payouts come from losers</h3>
      <ul>
        <li>HeroBet takes a platform fee from the total pool.</li>
        <li>Winning tickets split the remaining pool in proportion to stake size.</li>
        <li>If too many people choose the winning side, each winner's return adjusts down.</li>
        <li>This is a pari-mutuel model: platform revenue is fee-based, not house-risk based.</li>
      </ul>
    </div>
  </div>
  <div class="lh-ctas">
    <a class="btn" href="#/predictions">Browse prediction pools</a>
    <a class="btn ghost" href="#/wallet">Open wallet</a>
  </div>
  <p class="promo-fine">Important: this repository is still a demo. For real-money launch, use licensed operations, payment KYC/AML, server-side escrow, admin/oracle settlement, audit logs, responsible gaming controls, and locked Firestore rules.</p>
</section>

<div class="promo-row">
  <div class="card promo-soon">
    <h3>🧾 Fee ledger</h3>
    <p>Track fee reserve by market so operator revenue is transparent and separate from player escrow.</p>
    <span class="gc-soon">NEXT</span>
  </div>
  <div class="card promo-soon">
    <h3>🔐 Server settlement</h3>
    <p>Cloud Functions should settle markets and write payouts; clients should never self-credit real wallets.</p>
    <span class="gc-soon">NEXT</span>
  </div>
  <div class="card promo-soon">
    <h3>📡 Oracle results</h3>
    <p>Connect sports, weather, finance, or admin-signed result feeds for production-grade market resolution.</p>
    <span class="gc-soon">NEXT</span>
  </div>
</div>
`;

export const promosPage = {
  mount(outlet) {
    outlet.innerHTML = template;
    return {};
  },
};
