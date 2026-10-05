// HeroBet — Promotions page (Gift Drop flagship + upcoming promos)
const template = `
<section class="page-head">
  <div>
    <h1>PROMOTIONS</h1>
    <p class="sub">Hero rewards, earned the heroic way</p>
  </div>
</section>

<section class="card promo-hero">
  <div class="promo-badge">⚡ FLAGSHIP</div>
  <h2>GIFT DROP</h2>
  <p class="promo-tag">Catch it. Claim it. Win it.</p>
  <div class="promo-grid">
    <div>
      <h3>The round</h3>
      <ul>
        <li>One round <strong>every hour</strong>, 9:35am → 11:35pm (15 rounds/day)</li>
        <li>Rain strikes at a <strong>random second inside :35–:45</strong> — never later</li>
        <li><strong>59-second warning</strong> banner before the rain starts</li>
        <li>Gifts fall for up to 60s — the progress bar <strong>only depletes</strong> as heroes claim</li>
      </ul>
    </div>
    <div>
      <h3>Eligibility</h3>
      <ul>
        <li>Qualify with Classic stakes placed <strong>at or before 20 minutes before rain start</strong></li>
        <li>Day rounds (9:35–5:35): <strong>₦5,000</strong> on Classic · gift <strong>₦500</strong></li>
        <li>Evening rounds (6:35–11:35): <strong>₦10,000</strong> on Classic · gift <strong>₦1,000</strong></li>
        <li>The one-click <strong>hedge</strong> on Classic Crash costs a flat ₦220 (day) / ₦440 (evening)</li>
      </ul>
    </div>
    <div>
      <h3>The draw</h3>
      <ul>
        <li>Winners are drawn at rain start: a <strong>random 30%</strong> of eligible heroes</li>
        <li>10 eligible → 3 winners · hard cap of 100 winners per pool</li>
        <li>Gifts are <strong>real cash, credited instantly</strong> — no wagering</li>
        <li>Miss the tap and the gift stays in the pool — <em>claim it before it disappears</em></li>
      </ul>
    </div>
  </div>
  <div class="lh-ctas">
    <a class="btn" href="#/gift-drop">▶ Play the Gift Drop demo</a>
    <a class="btn ghost" href="#/crash">Qualify on Classic Crash</a>
  </div>
  <p class="promo-fine">Gift Drop is shown here in demo form. Full live rounds land with the rain integration milestone. 18+ · Terms apply · Play responsibly.</p>
</section>

<div class="promo-row">
  <div class="card promo-soon">
    <h3>🛡️ Hero Cashback</h3>
    <p>A weekly shield against rough sessions — a share of net losses returned every Monday.</p>
    <span class="gc-soon">COMING SOON</span>
  </div>
  <div class="card promo-soon">
    <h3>⚡ Weekend Missions</h3>
    <p>Complete heroic missions on Originals to unlock bonus credit and rain boosts.</p>
    <span class="gc-soon">COMING SOON</span>
  </div>
  <div class="card promo-soon">
    <h3>👑 Legend Leaderboard</h3>
    <p>Monthly leaderboard for the highest multipliers survived on Classic Crash.</p>
    <span class="gc-soon">COMING SOON</span>
  </div>
</div>
`;

export const promosPage = {
  mount(outlet) {
    outlet.innerHTML = template;
    return {};
  },
};
