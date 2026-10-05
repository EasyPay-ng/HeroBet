// HeroBet Gift Drop — demo engine
// Implements docs/gift-drop-spec.md:
//   • one round per hour, 9:35am–11:35pm (15 rounds/day)
//   • rain starts at a random second strictly INSIDE the :35–:45 window
//   • qualifying bets must be placed at or before (rainStart − 20:00)
//   • day rounds (9–17h): ₦5,000 req, ₦500 gift, ₦50,000 pool
//   • evening rounds (18–23h): ₦10,000 req, ₦1,000 gift, ₦100,000 pool
//   • winners = random 30% of eligible, hard cap 100 (pool ÷ gift)
//   • progress bar depletes as gifts are claimed — no refill

const ACTIVE_START = 9; // 9:35am round
const ACTIVE_END = 23; // 11:35pm round
const CAP = 100; // pool ÷ gift, both tiers
const WARN_MS = 59_000; // pre-rain banner duration
const RAIN_MAX_MS = 60_000; // rain hard stop

const HEDGE = {
  crashStake: 1000,
  ouStake: 544,
  crashCashout: 1.5,
  cost: 44, // guaranteed loss per pair
};

const $ = (id) => document.getElementById(id);

const fmtN = (n) => "₦" + n.toLocaleString("en-NG");
const fmtT = (d, withSecs = true) =>
  d.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    second: withSecs ? "2-digit" : undefined,
    hour12: true,
  });

const tierOf = (h) =>
  h >= 9 && h <= 17 ? "day" : h >= 18 && h <= 23 ? "evening" : "day";
const tierInfo = (t) =>
  t === "day"
    ? { gift: 500, pool: 50_000, req: 5_000, pairs: 5 }
    : { gift: 1_000, pool: 100_000, req: 10_000, pairs: 10 };

// ---------- rain scheduling ----------
// Rain time per hour is cached so it stays stable within the hour.
// Second is drawn from [35:00, 45:00) — never :45 or later.
const rainCache = new Map();
function rainForHour(y, m, d, h) {
  const key = `${y}-${m}-${d}-${h}`;
  if (!rainCache.has(key)) {
    const sec = 35 * 60 + Math.floor(Math.random() * 600); // 2100..2699
    rainCache.set(key, new Date(y, m, d, h, Math.floor(sec / 60), sec % 60));
  }
  return rainCache.get(key);
}

function computeNextRain(now = new Date()) {
  for (let add = 0; add < 2; add++) {
    const base = new Date(now);
    base.setDate(base.getDate() + add);
    const y = base.getFullYear(),
      m = base.getMonth(),
      d = base.getDate();
    for (let h = ACTIVE_START; h <= ACTIVE_END; h++) {
      const t = rainForHour(y, m, d, h);
      if (t > now) return t;
    }
  }
  return new Date(now.getTime() + 3600_000); // unreachable fallback
}

// ---------- state ----------
const st = {
  rainAt: computeNextRain(),
  tier: tierOf(computeNextRain().getHours()),
  triggered: false, // demo trigger shortens the warning to 3s
  rainActive: false,
  claimed: false,
  userEligible: false,
  eligibleCount: 24,
  winners: 0,
  giftsTotal: 0,
  giftsLeft: 0,
  selected: false,
  wallet: Number(localStorage.getItem("herobet_demo_wallet") || 0),
  timers: [],
};

const addTimer = (t) => st.timers.push(t);
const clearTimers = () => {
  st.timers.forEach(clearTimeout);
  st.timers = [];
};

// ---------- gift artwork ----------
function giftSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="6" y="26" width="52" height="32" rx="5" fill="url(#gGold)"/>
  <rect x="3" y="13" width="58" height="16" rx="5" fill="url(#gGold)"/>
  <rect x="27" y="13" width="10" height="45" fill="url(#gCrimson)"/>
  <rect x="6" y="31" width="52" height="4" fill="rgba(5,10,20,.22)"/>
  <circle cx="23" cy="11" r="6.5" fill="none" stroke="url(#gCrimson)" stroke-width="5"/>
  <circle cx="41" cy="11" r="6.5" fill="none" stroke="url(#gCrimson)" stroke-width="5"/>
  <path d="M35.5 34 28 46h4.6L30.5 55l8.8-12h-4.6l.8-9z" fill="#0A1224" opacity=".85"/>
</svg>`;
}

// ---------- panel ----------
function refreshPanel() {
  if (st.rainActive) return;
  const now = new Date();
  if (!st.rainAt || st.rainAt <= now) st.rainAt = computeNextRain(now);
  st.tier = tierOf(st.rainAt.getHours());
  const info = tierInfo(st.tier);
  const cutoff = new Date(st.rainAt.getTime() - 20 * 60_000);

  $("nextTime").textContent = fmtT(st.rainAt);
  const w = st.rainAt;
  const win = `${fmtT(new Date(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), 35), false)} – ${fmtT(new Date(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), 45), false)}`;
  $("rainWindow").textContent = `Rain window ${win} · random strike inside :35–:45`;
  $("tierChip").textContent =
    st.tier === "day" ? "DAY ROUND · ₦500 per gift" : "EVENING ROUND · ₦1,000 per gift";
  $("tierChip").className = "chip gold";
  $("poolLine").textContent = `Pool ${fmtN(info.pool)} · up to ${CAP} winners · random 30% of eligible`;

  const badge = $("eligBadge");
  if (st.userEligible) {
    badge.textContent = `Eligible ✓ for the ${fmtT(st.rainAt, false)} round`;
    badge.className = "badge ok";
  } else {
    badge.textContent = "Not eligible";
    badge.className = "badge no";
  }
  $("reqLine").textContent = `Qualify: ${fmtN(info.req)} on Classic before ${fmtT(cutoff, false)} — a bet placed exactly 20:00 before rain counts`;

  $("btnHedge").textContent = `Place hedge — ${info.pairs} pairs · ${fmtN(info.pairs * 1544)} staked · cost ${fmtN(info.pairs * HEDGE.cost)}`;
  $("btnRaw").textContent = `Raw bet ${fmtN(info.req)} (stake-only wins)`;

  const n = Math.max(0, st.eligibleCount | 0);
  const winners = n > 0 ? Math.max(1, Math.min(Math.floor(n * 0.3), CAP)) : 0;
  $("winnersPreview").textContent =
    n === 0
      ? "No eligible players — pool unclaimed."
      : `⌊30% × ${n}⌋ → ${winners} winner${winners === 1 ? "" : "s"} · ${fmtN(winners * info.gift)} of ${fmtN(info.pool)} pool`;
}

// ---------- warning banner ----------
function refreshBanner() {
  if (st.rainActive) return;
  const remaining = st.rainAt - new Date();
  const banner = $("incomingBanner");
  const showAt = st.triggered ? 3_000 : WARN_MS;
  if (remaining > 0 && remaining <= showAt) {
    $("incomingSecs").textContent = Math.ceil(remaining / 1000);
    banner.classList.add("show");
  } else {
    banner.classList.remove("show");
  }
}

// ---------- rain ----------
function startRain() {
  st.rainActive = true;
  st.claimed = false;
  st.triggered = false;
  const info = tierInfo(st.tier);

  const n = Math.max(0, st.eligibleCount | 0);
  st.winners = n > 0 ? Math.max(1, Math.min(Math.floor(n * 0.3), CAP)) : 0;
  st.giftsTotal = st.winners;
  st.giftsLeft = st.winners;
  st.selected =
    st.userEligible && n > 0 && Math.random() < st.winners / n;

  $("incomingBanner").classList.remove("show");
  const ov = $("rainOverlay");
  ov.hidden = false;
  requestAnimationFrame(() => ov.classList.add("show"));
  $("rainPool").textContent = `${fmtN(info.pool)} GIFT RAIN`;
  $("rainMsg").textContent = "";
  updateBar();

  // falling gifts
  addTimer(
    setInterval(() => {
      if (!st.rainActive) return;
      if ($("giftsField").childElementCount > 60) return;
      const el = document.createElement("div");
      el.className = "gift-fall";
      const size = 24 + Math.random() * 34;
      el.style.left = Math.random() * 96 + "vw";
      el.style.setProperty("--dur", 2.6 + Math.random() * 3.4 + "s");
      el.style.setProperty("--spin", Math.random() * 540 - 270 + "deg");
      el.innerHTML = giftSVG(size);
      $("giftsField").appendChild(el);
      setTimeout(() => el.remove(), 6_500);
    }, 240)
  );

  // rain countdown
  const endsAt = Date.now() + RAIN_MAX_MS;
  addTimer(
    setInterval(() => {
      if (!st.rainActive) return;
      const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      $("rainSecs").textContent = s;
    }, 250)
  );
  addTimer(setTimeout(() => endRain(st.giftsLeft <= 0 ? "empty" : "timeout"), RAIN_MAX_MS));

  // other heroes claim their gifts over ~28s
  scheduleBotClaim();
}

function scheduleBotClaim() {
  if (!st.rainActive || st.winners === 0) return;
  const mean = 28_000 / st.winners;
  addTimer(
    setTimeout(() => {
      if (!st.rainActive) return;
      st.giftsLeft = Math.max(0, st.giftsLeft - 1);
      updateBar();
      if (st.giftsLeft === 0) endRain("empty");
      else scheduleBotClaim();
    }, mean * (0.55 + Math.random() * 0.9))
  );
}

function updateBar() {
  const pct = st.giftsTotal ? (st.giftsLeft / st.giftsTotal) * 100 : 0;
  const fill = $("barFill");
  fill.style.width = pct + "%";
  fill.classList.toggle("low", pct <= 25);
  $("giftsLeftTxt").textContent = `${st.giftsLeft} / ${st.giftsTotal} gifts left`;
}

function tap() {
  if (!st.rainActive || st.claimed) return;
  const msg = $("rainMsg");
  if (!st.userEligible) {
    msg.textContent = "You're not eligible for this round — qualify before the cutoff.";
    msg.classList.remove("flash");
    void msg.offsetWidth;
    msg.classList.add("flash");
    return;
  }
  if (!st.selected) {
    msg.textContent = "So close! Another hero claimed that one — keep tapping!";
    msg.classList.remove("flash");
    void msg.offsetWidth;
    msg.classList.add("flash");
    return;
  }
  if (st.giftsLeft <= 0) return;
  st.claimed = true;
  st.giftsLeft = Math.max(0, st.giftsLeft - 1);
  updateBar();
  endRain("win");
}

function endRain(reason) {
  if (!st.rainActive) return;
  st.rainActive = false;
  clearTimers();
  const info = tierInfo(st.tier);

  const ov = $("rainOverlay");
  setTimeout(() => {
    ov.classList.remove("show");
    setTimeout(() => (ov.hidden = true), 450);
  }, 350);

  // eligibility resets every round — players re-qualify each hour
  st.userEligible = false;
  st.rainAt = computeNextRain();

  const modal = $("resultModal");
  const box = $("resultBox");
  const amount = $("resultAmount");
  const title = $("resultTitle");
  const sub = $("resultSub");

  modal.classList.remove("win");
  box.style.display = "";
  amount.style.display = "";

  if (reason === "win") {
    st.wallet += info.gift;
    localStorage.setItem("herobet_demo_wallet", String(st.wallet));
    $("walletBalance").textContent = st.wallet.toLocaleString("en-NG");
    flashWallet();
    title.textContent = "A HEROIC REWARD JUST DROPPED";
    amount.textContent = fmtN(info.gift);
    sub.textContent = `Congratulations! You won ${fmtN(info.gift)} — real cash, credited to your wallet instantly.`;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show", "win"));
  } else {
    title.textContent =
      reason === "empty" ? "THE GIFTS VANISHED!" : "THE RAIN HAS PASSED";
    amount.style.display = "none";
    box.style.display = "none";
    sub.textContent =
      reason === "empty" && st.selected
        ? "You were on the winners' list — but the heroes tapped faster. Claim it before it disappears next time."
        : reason === "empty"
          ? "The heroes got there first this round. Qualify early for the next drop."
          : st.winners === 0
            ? "No heroes qualified this round — the pool went unclaimed."
            : "This round is over. The next drop is already forming in the clouds.";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
  }
}

function flashWallet() {
  const w = document.querySelector(".wallet");
  w.classList.remove("flash");
  void w.offsetWidth;
  w.classList.add("flash");
}

// ---------- wiring ----------
export function initGiftDrop() {
  $("walletBalance").textContent = st.wallet.toLocaleString("en-NG");

  $("btnHedge").addEventListener("click", () => {
    if (st.rainActive || st.userEligible) return;
    st.userEligible = true;
    const info = tierInfo(st.tier);
    $("betNote").innerHTML = `<strong>Hedge placed:</strong> ${info.pairs} × (₦1,000 @ 1.50 auto-cashout + ₦544 Under 1.5) — guaranteed cost ${fmtN(info.pairs * HEDGE.cost)}. You're in for the ${fmtT(st.rainAt, false)} round.`;
    refreshPanel();
  });

  $("btnRaw").addEventListener("click", () => {
    if (st.rainActive || st.userEligible) return;
    st.userEligible = true;
    const info = tierInfo(st.tier);
    $("betNote").innerHTML = `<strong>Raw bet placed:</strong> ${fmtN(info.req)} on Classic. It qualifies you — but if it wins, you're credited <strong>stake only, no multiplier</strong>.`;
    refreshPanel();
  });

  $("eligibleCount").addEventListener("input", (e) => {
    st.eligibleCount = Math.max(0, Math.min(5000, Number(e.target.value) || 0));
    refreshPanel();
  });

  $("btnTrigger").addEventListener("click", () => {
    if (st.rainActive) return;
    st.rainAt = new Date(Date.now() + 3_200);
    st.triggered = true;
    refreshPanel();
  });

  $("btnReset").addEventListener("click", () => {
    clearTimers();
    st.rainActive = false;
    st.userEligible = false;
    st.triggered = false;
    st.eligibleCount = 24;
    st.wallet = 0;
    localStorage.removeItem("herobet_demo_wallet");
    $("eligibleCount").value = 24;
    $("walletBalance").textContent = "0";
    $("betNote").innerHTML =
      "Qualify with the calibrated hedge — or a raw bet (raw qualifying bets pay <strong>stake only</strong> if they win, no multiplier).";
    st.rainAt = computeNextRain();
    refreshPanel();
  });

  $("tapBtn").addEventListener("click", tap);
  $("resultClose").addEventListener("click", () => {
    const modal = $("resultModal");
    modal.classList.remove("show", "win");
    setTimeout(() => (modal.hidden = true), 300);
    refreshPanel();
  });

  refreshPanel();
  setInterval(() => {
    const now = new Date();
    if (!st.rainActive && st.rainAt <= now) {
      startRain();
      return;
    }
    refreshPanel();
    refreshBanner();
  }, 250);
}
