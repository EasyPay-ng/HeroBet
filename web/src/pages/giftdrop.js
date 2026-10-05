// HeroBet — GIFT DROP demo page (promo sandbox).
// The full rain flow from docs/gift-drop-spec.md, playable on demand.
// Demo wins are credited to the real platform wallet (ledger type "rain-demo").
import { $, $$, fmtN, toast } from "../ui.js";
import { currentUser, credit } from "../backend.js";
import { openAuthModal } from "../auth-ui.js";

const OVERLAY_HTML = `
<div id="incomingBanner" class="incoming" aria-live="polite">
  <div class="incoming-label">⚡ GIFT DROP INCOMING</div>
  <div class="incoming-secs"><span id="incomingSecs">59</span>s</div>
  <div class="incoming-sub">Claim it before it disappears.</div>
</div>

<div id="rainOverlay" class="rain-overlay" hidden>
  <div id="giftsField" class="gifts-field"></div>
  <div class="rain-ui">
    <div id="rainPool" class="rain-pool">₦100,000 GIFT RAIN</div>
    <div class="rain-timer"><span id="rainSecs">60</span>s</div>
    <button id="tapBtn" class="tap-btn"><span class="tap-ring"></span>TAP TO<br/>CLAIM</button>
    <div id="rainMsg" class="rain-msg"></div>
    <div class="bar"><div id="barFill" class="bar-fill"></div></div>
    <div id="giftsLeftTxt" class="gifts-left">— / — gifts left</div>
  </div>
</div>

<div id="resultModal" class="modal" hidden>
  <div class="modal-card">
    <div class="burst"></div>
    <div id="resultBox" class="giftbox">
      <div class="lid"><span class="bow"></span></div>
      <div class="boxbody">
        <svg viewBox="0 0 24 24" class="bolt" aria-hidden="true"><path d="M13 2 4 16h6l-1.5 6L18 8h-6l1-6z"/></svg>
      </div>
    </div>
    <h2 id="resultTitle">A HEROIC REWARD JUST DROPPED</h2>
    <div id="resultAmount" class="amount">₦500</div>
    <p id="resultSub"></p>
    <button id="resultClose" class="btn">Continue</button>
  </div>
</div>
`;

const PAGE_HTML = `
<section class="page-head">
  <div>
    <h1>GIFT DROP — DEMO</h1>
    <p class="sub">Catch it. Claim it. Win it. · demo wins land in your real wallet</p>
  </div>
  <div class="page-head-right"><a class="btn ghost" href="#/promos">Full terms</a></div>
</section>

<section class="hero gd-hero">
  <div class="hero-tag">Catch it. Claim it. Win it.</div>
  <h1 class="hero-title">GIFT DROP</h1>
  <p class="hero-sub">Hourly gift rain — <strong>₦50,000</strong> day pools, <strong>₦100,000</strong> evening pools. One round every hour, 9:35am – 11:35pm. Rain strikes randomly between :35 and :45.</p>
</section>

<section class="panel-grid">
  <div class="card">
    <div class="card-head"><h2>NEXT GIFT DROP</h2><span id="tierChip" class="chip gold">—</span></div>
    <div class="next-round">
      <div id="nextTime" class="next-time">--:--:--</div>
      <div id="rainWindow" class="next-window">Rain window —</div>
    </div>
    <div id="poolLine" class="pool-line">—</div>
    <div class="elig-row">
      <span id="eligBadge" class="badge no">Not eligible</span>
      <span id="reqLine" class="req-line">—</span>
    </div>
    <div class="bet-buttons">
      <button id="btnHedge" class="btn">Place hedge</button>
      <button id="btnRaw" class="btn ghost">Raw bet</button>
    </div>
    <p id="betNote" class="bet-note">Qualify with the calibrated hedge — or a raw bet (raw qualifying bets pay <strong>stake only</strong> if they win, no multiplier).</p>
    <details class="hedge-details">
      <summary>The hedge recipe (per Classic crash round)</summary>
      <table class="hedge-table">
        <tr><td>Classic crash, auto-cashout 1.50x</td><td class="num">₦1,000</td></tr>
        <tr><td>O/U Under 1.5 (coeff ≈ 2.757)</td><td class="num">₦544</td></tr>
        <tr class="total"><td>Staked / returned either way</td><td class="num">₦1,544 → ₦1,500</td></tr>
        <tr class="cost"><td>Guaranteed cost per pair</td><td class="num">₦44</td></tr>
      </table>
      <p class="hedge-note">×5 pairs qualifies a day round (₦220) · ×10 pairs qualifies an evening round (₦440).</p>
    </details>
  </div>

  <div class="card">
    <div class="card-head"><h2>ROUND SIMULATION</h2><span class="chip">demo</span></div>
    <label class="field">
      <span>Eligible players this round (including you)</span>
      <input id="eligibleCount" type="number" min="0" max="5000" value="24" />
    </label>
    <div id="winnersPreview" class="winners-preview">—</div>
    <div class="sim-buttons">
      <button id="btnTrigger" class="btn danger">Trigger rain now</button>
      <button id="btnReset" class="btn ghost">Reset demo</button>
    </div>
    <p class="sim-note">Winners are drawn at rain start: a random 30% of eligible players, capped at 100 (the pool). Tapping only pays out if you were drawn — and before the gifts run out.</p>
  </div>
</section>
`;

// ---- engine (from docs/gift-drop-spec.md) ----
const ACTIVE_START = 9;
const ACTIVE_END = 23;
const CAP = 100;
const WARN_MS = 59_000;
const RAIN_MAX_MS = 60_000;
const HEDGE = { cost: 44 };

const fmtT = (d, withSecs = true) =>
  d.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    second: withSecs ? "2-digit" : undefined,
    hour12: true,
  });
const tierOf = (h) => (h >= 9 && h <= 17 ? "day" : h >= 18 && h <= 23 ? "evening" : "day");
const tierInfo = (t) =>
  t === "day" ? { gift: 500, pool: 50_000, req: 5_000, pairs: 5 } : { gift: 1_000, pool: 100_000, req: 10_000, pairs: 10 };

const rainCache = new Map();
function rainForHour(y, m, d, h) {
  const key = `${y}-${m}-${d}-${h}`;
  if (!rainCache.has(key)) {
    const sec = 35 * 60 + Math.floor(Math.random() * 600); // [35:00, 45:00)
    rainCache.set(key, new Date(y, m, d, h, Math.floor(sec / 60), sec % 60));
  }
  return rainCache.get(key);
}
function computeNextRain(now = new Date()) {
  for (let add = 0; add < 2; add++) {
    const base = new Date(now);
    base.setDate(base.getDate() + add);
    const y = base.getFullYear(), m = base.getMonth(), d = base.getDate();
    for (let h = ACTIVE_START; h <= ACTIVE_END; h++) {
      const t = rainForHour(y, m, d, h);
      if (t > now) return t;
    }
  }
  return new Date(now.getTime() + 3600_000);
}

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

export const giftdropPage = {
  mount(outlet) {
    outlet.innerHTML = PAGE_HTML;
    const overlays = document.createElement("div");
    overlays.innerHTML = OVERLAY_HTML;
    const banner = overlays.querySelector("#incomingBanner");
    const rainOverlay = overlays.querySelector("#rainOverlay");
    const resultModal = overlays.querySelector("#resultModal");
    document.body.append(banner, rainOverlay, resultModal);

    const st = {
      rainAt: computeNextRain(),
      tier: "day",
      triggered: false,
      rainActive: false,
      claimed: false,
      userEligible: false,
      eligibleCount: 24,
      winners: 0,
      giftsTotal: 0,
      giftsLeft: 0,
      selected: false,
      timers: [],
      destroyed: false,
    };
    const addTimer = (t) => st.timers.push(t);
    const clearTimers = () => {
      st.timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      st.timers = [];
    };

    function refreshPanel() {
      if (st.rainActive || st.destroyed) return;
      const now = new Date();
      if (!st.rainAt || st.rainAt <= now) st.rainAt = computeNextRain(now);
      st.tier = tierOf(st.rainAt.getHours());
      const info = tierInfo(st.tier);
      const cutoff = new Date(st.rainAt.getTime() - 20 * 60_000);
      $("#nextTime").textContent = fmtT(st.rainAt);
      const w = st.rainAt;
      $("#rainWindow").textContent = `Rain window ${fmtT(new Date(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), 35), false)} – ${fmtT(new Date(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), 45), false)} · random strike inside :35–:45`;
      $("#tierChip").textContent = st.tier === "day" ? "DAY ROUND · ₦500 per gift" : "EVENING ROUND · ₦1,000 per gift";
      $("#poolLine").textContent = `Pool ${fmtN(info.pool)} · up to ${CAP} winners · random 30% of eligible`;
      const badge = $("#eligBadge");
      if (st.userEligible) {
        badge.textContent = `Eligible ✓ for the ${fmtT(st.rainAt, false)} round`;
        badge.className = "badge ok";
      } else {
        badge.textContent = "Not eligible";
        badge.className = "badge no";
      }
      $("#reqLine").textContent = `Qualify: ${fmtN(info.req)} on Classic before ${fmtT(cutoff, false)} — a bet placed exactly 20:00 before rain counts`;
      $("#btnHedge").textContent = `Place hedge — ${info.pairs} pairs · ${fmtN(info.pairs * 1544)} staked · cost ${fmtN(info.pairs * HEDGE.cost)}`;
      $("#btnRaw").textContent = `Raw bet ${fmtN(info.req)} (stake-only wins)`;
      const n = Math.max(0, st.eligibleCount | 0);
      const winners = n > 0 ? Math.max(1, Math.min(Math.floor(n * 0.3), CAP)) : 0;
      $("#winnersPreview").textContent =
        n === 0
          ? "No eligible players — pool unclaimed."
          : `⌊30% × ${n}⌋ → ${winners} winner${winners === 1 ? "" : "s"} · ${fmtN(winners * info.gift)} of ${fmtN(info.pool)} pool`;
    }

    function refreshBanner() {
      if (st.rainActive || st.destroyed) return;
      const remaining = st.rainAt - new Date();
      const showAt = st.triggered ? 3_000 : WARN_MS;
      if (remaining > 0 && remaining <= showAt) {
        $("#incomingSecs").textContent = Math.ceil(remaining / 1000);
        banner.classList.add("show");
      } else {
        banner.classList.remove("show");
      }
    }

    function startRain() {
      st.rainActive = true;
      st.claimed = false;
      st.triggered = false;
      const info = tierInfo(st.tier);
      const n = Math.max(0, st.eligibleCount | 0);
      st.winners = n > 0 ? Math.max(1, Math.min(Math.floor(n * 0.3), CAP)) : 0;
      st.giftsTotal = st.winners;
      st.giftsLeft = st.winners;
      st.selected = st.userEligible && n > 0 && Math.random() < st.winners / n;
      banner.classList.remove("show");
      rainOverlay.hidden = false;
      requestAnimationFrame(() => rainOverlay.classList.add("show"));
      $("#rainPool").textContent = `${fmtN(info.pool)} GIFT RAIN`;
      $("#rainMsg").textContent = "";
      updateBar();

      addTimer(
        setInterval(() => {
          if (!st.rainActive) return;
          if ($("#giftsField").childElementCount > 60) return;
          const g = document.createElement("div");
          g.className = "gift-fall";
          const size = 24 + Math.random() * 34;
          g.style.left = Math.random() * 96 + "vw";
          g.style.setProperty("--dur", 2.6 + Math.random() * 3.4 + "s");
          g.style.setProperty("--spin", Math.random() * 540 - 270 + "deg");
          g.innerHTML = giftSVG(size);
          $("#giftsField").appendChild(g);
          setTimeout(() => g.remove(), 6_500);
        }, 240)
      );

      const endsAt = Date.now() + RAIN_MAX_MS;
      addTimer(
        setInterval(() => {
          if (!st.rainActive) return;
          $("#rainSecs").textContent = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        }, 250)
      );
      addTimer(setTimeout(() => endRain(st.giftsLeft <= 0 ? "empty" : "timeout"), RAIN_MAX_MS));
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
      const fill = $("#barFill");
      fill.style.width = pct + "%";
      fill.classList.toggle("low", pct <= 25);
      $("#giftsLeftTxt").textContent = `${st.giftsLeft} / ${st.giftsTotal} gifts left`;
    }

    function tap() {
      if (!st.rainActive || st.claimed) return;
      const msg = $("#rainMsg");
      const flash = () => {
        msg.classList.remove("flash");
        void msg.offsetWidth;
        msg.classList.add("flash");
      };
      if (!st.userEligible) {
        msg.textContent = "You're not eligible for this round — qualify before the cutoff.";
        return flash();
      }
      if (!st.selected) {
        msg.textContent = "So close! Another hero claimed that one — keep tapping!";
        return flash();
      }
      if (st.giftsLeft <= 0) return;
      st.claimed = true;
      st.giftsLeft = Math.max(0, st.giftsLeft - 1);
      updateBar();
      endRain("win");
    }

    async function endRain(reason) {
      if (!st.rainActive) return;
      st.rainActive = false;
      clearTimers();
      const info = tierInfo(st.tier);
      setTimeout(() => {
        rainOverlay.classList.remove("show");
        setTimeout(() => (rainOverlay.hidden = true), 450);
      }, 350);

      st.userEligible = false;
      st.rainAt = computeNextRain();

      resultModal.classList.remove("win");
      if (reason === "win") {
        const u = currentUser();
        if (u) {
          try {
            await credit({ type: "rain-demo", amount: info.gift, note: "Gift Drop demo win" });
          } catch (e) {
            console.warn(e);
          }
        } else {
          toast("Sign in to bank Gift Drop wins in your wallet", "warn");
        }
        $("#resultTitle").textContent = "A HEROIC REWARD JUST DROPPED";
        $("#resultAmount").textContent = fmtN(info.gift);
        $("#resultSub").textContent = `Congratulations! You won ${fmtN(info.gift)}${currentUser() ? " — credited to your wallet instantly." : " — sign in to bank demo wins."}`;
      } else {
        $("#resultTitle").textContent = reason === "empty" ? "THE GIFTS VANISHED!" : "THE RAIN HAS PASSED";
        $("#resultAmount").style.display = "none";
        $("#resultBox").style.display = "none";
        $("#resultSub").textContent =
          reason === "empty" && st.selected
            ? "You were on the winners' list — but the heroes tapped faster. Claim it before it disappears next time."
            : reason === "empty"
              ? "The heroes got there first this round. Qualify early for the next drop."
              : st.winners === 0
                ? "No heroes qualified this round — the pool went unclaimed."
                : "This round is over. The next drop is already forming in the clouds.";
      }
      resultModal.hidden = false;
      requestAnimationFrame(() => resultModal.classList.add("show", reason === "win" ? "win" : ""));
      if (reason !== "win") {
        $("#resultAmount").style.display = "";
        $("#resultBox").style.display = "";
      }
    }

    // wiring
    $("#btnHedge").addEventListener("click", () => {
      if (st.rainActive || st.userEligible) return;
      st.userEligible = true;
      const info = tierInfo(st.tier);
      $("#betNote").innerHTML = `<strong>Hedge placed:</strong> ${info.pairs} × (₦1,000 @ 1.50 auto-cashout + ₦544 Under 1.5) — guaranteed cost ${fmtN(info.pairs * HEDGE.cost)}. You're in for the ${fmtT(st.rainAt, false)} round.`;
      refreshPanel();
    });
    $("#btnRaw").addEventListener("click", () => {
      if (st.rainActive || st.userEligible) return;
      st.userEligible = true;
      const info = tierInfo(st.tier);
      $("#betNote").innerHTML = `<strong>Raw bet placed:</strong> ${fmtN(info.req)} on Classic. It qualifies you — but if it wins, you're credited <strong>stake only, no multiplier</strong>.`;
      refreshPanel();
    });
    $("#eligibleCount").addEventListener("input", (e) => {
      st.eligibleCount = Math.max(0, Math.min(5000, Number(e.target.value) || 0));
      refreshPanel();
    });
    $("#btnTrigger").addEventListener("click", () => {
      if (st.rainActive) return;
      st.rainAt = new Date(Date.now() + 3_200);
      st.triggered = true;
      refreshPanel();
    });
    $("#btnReset").addEventListener("click", () => {
      clearTimers();
      st.rainActive = false;
      st.userEligible = false;
      st.triggered = false;
      st.eligibleCount = 24;
      $("#eligibleCount").value = 24;
      $("#betNote").innerHTML = "Qualify with the calibrated hedge — or a raw bet (raw qualifying bets pay <strong>stake only</strong> if they win, no multiplier).";
      st.rainAt = computeNextRain();
      banner.classList.remove("show");
      refreshPanel();
    });
    $("#tapBtn").addEventListener("click", tap);
    $("#resultClose").addEventListener("click", () => {
      resultModal.classList.remove("show", "win");
      setTimeout(() => (resultModal.hidden = true), 300);
      refreshPanel();
    });

    refreshPanel();
    const loop = setInterval(() => {
      if (st.destroyed) return;
      const now = new Date();
      if (!st.rainActive && st.rainAt <= now) return startRain();
      refreshPanel();
      refreshBanner();
    }, 250);
    st.timers.push(loop);

    return {
      destroy() {
        st.destroyed = true;
        clearTimers();
        banner.remove();
        rainOverlay.remove();
        resultModal.remove();
      },
    };
  },
};
