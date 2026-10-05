// HeroBet — CLASSIC CRASH (HeroBet Original)
// Time-synchronised global rounds, auto-cashout, O/U Under 1.5 side market
// (the Gift Drop hedge leg), live bets table, round history strip.
import { $, $$, esc, fmtN, toast } from "../ui.js";
import {
  currentUser,
  placeBet,
  settleBet,
  subscribeRoundBets,
  mode,
  UNDER15_COEFF,
} from "../backend.js";
import {
  BETTING_MS,
  crashPointFor,
  multiplierAt,
  currentRoundIndex,
  roundPhase,
  roundId,
  roundStart,
} from "../engine.js";
import { openAuthModal } from "../auth-ui.js";

const BOT_NAMES = [
  "IronMarshal", "DeltaFalcon", "NightGuardian", "LagosLightning", "CrimsonArrow",
  "SteelSage", "AlphaShield", "WarriWave", "BeninBolt", "AbujaAce",
  "KanoKnight", "PortHarcourtPower", "ZenithZealot", "GoldenGazelle",
];

const template = `
<section class="page-head">
  <div>
    <h1>CLASSIC CRASH</h1>
    <p class="sub">HeroBet Original · shared rounds every ~20 seconds</p>
  </div>
  <div class="page-head-right">
    <span class="chip gold" id="fairChip">⚡ shared-seed rounds</span>
  </div>
</section>

<div class="game-layout">
  <section class="card game-stage">
    <div class="crash-wrap">
      <canvas id="crashCanvas"></canvas>
      <div class="crash-center">
        <div id="crashMult" class="crash-mult">1.00x</div>
        <div id="crashPhase" class="crash-phase">Syncing rounds…</div>
        <div class="crash-bar"><div id="betBar" class="crash-bar-fill"></div></div>
      </div>
    </div>
    <div id="roundStrip" class="round-strip"></div>
  </section>

  <aside class="game-side">
    <div class="card bet-panel">
      <div class="bet-tabs">
        <button class="bet-tab active" data-tab="crash">Crash</button>
        <button class="bet-tab" data-tab="under">Under 1.5</button>
      </div>

      <div data-panel="crash">
        <label class="field">
          <span>Stake (₦)</span>
          <div class="chips-row">
            <button class="mini" data-stake="500">500</button>
            <button class="mini" data-stake="1000">1k</button>
            <button class="mini" data-stake="5000">5k</button>
            <button class="mini" data-stake="10000">10k</button>
          </div>
          <input id="crashStake" type="number" min="100" max="100000" step="100" value="1000" />
        </label>
        <label class="field">
          <span>Auto-cashout</span>
          <div class="chips-row">
            <button class="mini" data-auto="1.50">1.50x</button>
            <button class="mini" data-auto="2.00">2.00x</button>
            <button class="mini" data-auto="5.00">5.00x</button>
          </div>
          <input id="crashAuto" type="number" min="1.01" max="100" step="0.01" value="1.50" />
        </label>
        <button id="crashPlace" class="btn wide">Place bet</button>
      </div>

      <div data-panel="under" hidden>
        <div class="ou-quote">
          <div><span>Pays</span><strong>${UNDER15_COEFF}x</strong></div>
          <div><span>Wins if</span><strong>crash &lt; 1.50x</strong></div>
          <div><span>Stake</span><strong>₦544 recipe</strong></div>
        </div>
        <label class="field">
          <span>Stake (₦)</span>
          <div class="chips-row">
            <button class="mini" data-oustake="544">544</button>
            <button class="mini" data-oustake="1000">1k</button>
            <button class="mini" data-oustake="5000">5k</button>
          </div>
          <input id="ouStake" type="number" min="100" max="100000" step="1" value="544" />
        </label>
        <button id="ouPlace" class="btn wide">Place Under 1.5</button>
      </div>

      <button id="hedgeBtn" class="hedge-btn">
        ⚡ GIFT DROP HEDGE — ₦1,544 staked · returns ₦1,500 either way · counts toward rain eligibility
      </button>
      <button id="cashoutBtn" class="btn danger wide" hidden></button>
    </div>

    <div class="card live-card">
      <div class="card-head"><h2>LIVE BETS</h2><span id="liveCount" class="chip">0</span></div>
      <div class="live-table" id="liveTable"></div>
    </div>
  </aside>
</section>
`;

export const crashPage = {
  mount(outlet) {
    outlet.innerHTML = template;

    const el = {
      canvas: $("#crashCanvas"),
      mult: $("#crashMult"),
      phase: $("#crashPhase"),
      betBar: $("#betBar"),
      strip: $("#roundStrip"),
      crashPlace: $("#crashPlace"),
      ouPlace: $("#ouPlace"),
      cashout: $("#cashoutBtn"),
      liveTable: $("#liveTable"),
      liveCount: $("#liveCount"),
      crashStake: $("#crashStake"),
      crashAuto: $("#crashAuto"),
      ouStake: $("#ouStake"),
    };

    const st = {
      roundIdx: -1,
      phase: "",
      roundBets: [],
      myBets: new Map(),
      bots: [],
      settled: false,
      unRound: null,
      raf: 0,
      destroyed: false,
    };

    const ctx = el.canvas.getContext("2d");

    // --- tabs & chips ---
    $$(".bet-tab").forEach((b) =>
      b.addEventListener("click", () => {
        $$(".bet-tab").forEach((x) => x.classList.toggle("active", x === b));
        $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
      })
    );
    $$("[data-stake]").forEach((b) => b.addEventListener("click", () => (el.crashStake.value = b.dataset.stake)));
    $$("[data-auto]").forEach((b) => b.addEventListener("click", () => (el.crashAuto.value = b.dataset.auto)));
    $$("[data-oustake]").forEach((b) => b.addEventListener("click", () => (el.ouStake.value = b.dataset.oustake)));

    // --- betting ---
    const requireUser = () => {
      if (currentUser()) return true;
      openAuthModal();
      return false;
    };

    async function tryPlace(bet) {
      try {
        await placeBet(bet);
        return true;
      } catch (e) {
        if (e.message === "INSUFFICIENT") toast("Not enough balance — top up in the Wallet", "err");
        else if (e.message === "AUTH") openAuthModal();
        else toast(e.message, "err");
        return false;
      }
    }

    el.crashPlace.addEventListener("click", async () => {
      if (!requireUser()) return;
      if (st.phase !== "betting") return toast("Bets open during the betting window", "warn");
      const stake = Math.round(Number(el.crashStake.value));
      const auto = Number(el.crashAuto.value);
      if (!(stake >= 100) || stake > 100000) return toast("Stake must be ₦100 – ₦100,000", "warn");
      if (!(auto >= 1.01)) return toast("Auto-cashout must be at least 1.01x", "warn");
      await tryPlace({
        game: "crash",
        roundId: roundId(st.roundIdx),
        roundStart: roundStart(st.roundIdx),
        mode: "crash",
        stake,
        autoCashout: auto,
        qualifyVolume: auto === 1.5 && stake >= 1000 ? stake : 0,
      });
      toast(`₦${stake.toLocaleString()} @ ${auto.toFixed(2)}x — good luck, hero ⚡`, "ok");
    });

    el.ouPlace.addEventListener("click", async () => {
      if (!requireUser()) return;
      if (st.phase !== "betting") return toast("Under 1.5 is a pre-round market — bet during the betting window", "warn");
      const stake = Math.round(Number(el.ouStake.value));
      if (!(stake >= 100) || stake > 100000) return toast("Stake must be ₦100 – ₦100,000", "warn");
      const ok = await tryPlace({
        game: "crash",
        roundId: roundId(st.roundIdx),
        roundStart: roundStart(st.roundIdx),
        mode: "under15",
        stake,
      });
      if (ok) toast(`Under 1.5 · ₦${stake.toLocaleString()} — pays ${UNDER15_COEFF}x if it crashes early`, "ok");
    });

    $("#hedgeBtn").addEventListener("click", async () => {
      if (!requireUser()) return;
      if (st.phase !== "betting") return toast("Place the hedge during the betting window", "warn");
      const ok1 = await tryPlace({
        game: "crash",
        roundId: roundId(st.roundIdx),
        roundStart: roundStart(st.roundIdx),
        mode: "crash",
        stake: 1000,
        autoCashout: 1.5,
        hedge: true,
        qualifyVolume: 1000,
      });
      if (!ok1) return;
      const ok2 = await tryPlace({
        game: "crash",
        roundId: roundId(st.roundIdx),
        roundStart: roundStart(st.roundIdx),
        mode: "under15",
        stake: 544,
        hedge: true,
      });
      if (ok2)
        toast(
          `Hedge placed — ₦1,544 staked, returns ₦1,500 either way (cost ₦44). Qualifying volume: ₦1,000 toward Gift Drop.`,
          "ok"
        );
    });

    el.cashout.addEventListener("click", () => {
      const m = multiplierAt(roundPhase(st.roundIdx).elapsed || 0);
      const active = [...st.myBets.values()].filter(
        (b) => b.mode === "crash" && b.status === "placed" && !b._cashing
      );
      active.forEach((b) => doCashout(b, m, true));
    });

    async function doCashout(bet, mult, manual = false) {
      if (bet._cashing || bet.status !== "placed") return;
      bet._cashing = true;
      const payout = Math.round(bet.stake * mult);
      try {
        await settleBet(
          bet.id,
          { status: "cashed", multiplier: Number(mult.toFixed(2)), payout },
          payout,
          `Crash cashout ${mult.toFixed(2)}x`
        );
        if (manual) toast(`Cashed out at ${mult.toFixed(2)}x — ${fmtN(payout)} 🎉`, "ok");
      } catch (e) {
        bet._cashing = false;
        console.warn(e);
      }
    }

    // --- round transitions ---
    function onRoundChange(i) {
      st.roundIdx = i;
      st.phase = "";
      st.settled = false;
      st.bots = [];
      if (st.unRound) st.unRound();
      st.unRound = subscribeRoundBets(roundId(i), (rows) => {
        st.roundBets = rows;
        const u = currentUser();
        st.myBets = new Map(
          rows
            .filter((r) => u && r.uid === u.uid && r.status === "placed")
            .map((r) => [r.id, r])
        );
        renderTable();
      });
      renderStrip();
    }

    function spawnBots() {
      if (mode !== "local") return; // real players in Firestore mode
      const n = 3 + Math.floor(Math.random() * 4);
      const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, n);
      st.bots = names.map((name) => {
        const isUnder = Math.random() < 0.3;
        return {
          id: "bot-" + name + st.roundIdx,
          name,
          bot: true,
          mode: isUnder ? "under15" : "crash",
          stake: [200, 500, 1000, 1000, 2000, 544, 5000][Math.floor(Math.random() * 7)],
          autoCashout: 1.15 + Math.random() * 2.5,
          status: "placed",
          payout: 0,
          multiplier: null,
          createdAt: Date.now() - Math.floor(Math.random() * 4000),
        };
      });
    }

    function settleRound(i) {
      st.settled = true;
      const crashPoint = crashPointFor(i);
      for (const b of st.myBets.values()) {
        if (b.status !== "placed") continue;
        if (b.mode === "crash") {
          settleBet(b.id, { status: "lost", multiplier: null, payout: 0, crashPoint });
        } else if (b.mode === "under15") {
          const won = crashPoint < 1.5;
          const payout = won ? Math.round(b.stake * UNDER15_COEFF) : 0;
          settleBet(
            b.id,
            { status: won ? "won" : "lost", multiplier: won ? UNDER15_COEFF : null, payout, crashPoint },
            payout,
            "Under 1.5 win"
          );
          if (won) toast(`Under 1.5 hit at ${crashPoint.toFixed(2)}x — ${fmtN(payout)} 🎉`, "ok");
        }
      }
      // bots (local mode eye-candy)
      for (const bot of st.bots) {
        if (bot.mode === "under15") {
          const won = crashPoint < 1.5;
          bot.status = won ? "won" : "lost";
          bot.multiplier = won ? UNDER15_COEFF : null;
          bot.payout = won ? Math.round(bot.stake * UNDER15_COEFF) : 0;
        } else if (!bot._cashed) {
          bot.status = "lost";
          bot.payout = 0;
        }
      }
      renderTable();
    }

    // --- rendering ---
    function renderStrip() {
      const items = [];
      for (let k = 1; k <= 18; k++) {
        const idx = st.roundIdx - k;
        if (idx < 0) break;
        const cp = crashPointFor(idx);
        const cls = cp < 1.5 ? "low" : cp < 5 ? "mid" : "high";
        items.push(`<span class="pill ${cls}">${cp.toFixed(2)}x</span>`);
      }
      el.strip.innerHTML = items.join("");
    }

    function renderTable() {
      const u = currentUser();
      const rows = [...st.bots, ...st.roundBets]
        .filter((b) => b.roundId === roundId(st.roundIdx) || b.bot)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 20);
      el.liveCount.textContent = rows.length;
      if (!rows.length) {
        el.liveTable.innerHTML = `<div class="empty">No heroes in this round yet — be the first ⚡</div>`;
        return;
      }
      el.liveTable.innerHTML = `<table><thead><tr>
        <th>Hero</th><th>Market</th><th class="num">Stake</th><th class="num">Mult</th><th class="num">Payout</th>
      </tr></thead><tbody>${rows
        .map((b) => {
          const mine = u && b.uid === u.uid;
          const status =
            b.status === "cashed" || b.status === "won"
              ? `<span class="win">${(b.multiplier || 0).toFixed(2)}x</span>`
              : b.status === "lost"
                ? `<span class="loss">—</span>`
                : `<span class="pending">in play</span>`;
          return `<tr class="${mine ? "me" : ""} ${b.bot ? "bot" : ""}">
            <td>${esc(b.name)}${mine ? " <span class='you'>(you)</span>" : ""}</td>
            <td>${b.mode === "under15" ? "Under 1.5" : "Crash"}</td>
            <td class="num">${fmtN(b.stake)}</td>
            <td class="num">${status}</td>
            <td class="num">${b.payout ? fmtN(b.payout) : "—"}</td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
    }

    // --- canvas ---
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const r = el.canvas.parentElement.getBoundingClientRect();
      el.canvas.width = r.width * dpr;
      el.canvas.height = r.height * dpr;
      el.canvas.style.width = r.width + "px";
      el.canvas.style.height = r.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function drawGraph(elapsedMs, crashed, crashPoint) {
      const r = el.canvas.getBoundingClientRect();
      const w = r.width,
        h = r.height;
      const padX = 14,
        padY = 16;
      ctx.clearRect(0, 0, w, h);

      const mNow = crashed ? crashPoint : multiplierAt(elapsedMs);
      const yMax = Math.max(2, mNow * 1.18);
      const tMax = Math.max(10, elapsedMs / 1000 + 3);
      const X = (t) => padX + (t / tMax) * (w - 2 * padX);
      const Y = (m) => h - padY - ((m - 1) / (yMax - 1)) * (h - 2 * padY);

      // grid
      ctx.strokeStyle = "rgba(35,53,92,.55)";
      ctx.lineWidth = 1;
      const steps = 4;
      for (let g = 0; g <= steps; g++) {
        const m = 1 + ((yMax - 1) * g) / steps;
        ctx.beginPath();
        ctx.moveTo(padX, Y(m));
        ctx.lineTo(w - padX, Y(m));
        ctx.stroke();
        ctx.fillStyle = "rgba(147,164,198,.5)";
        ctx.font = "10px Sora, sans-serif";
        ctx.fillText(m.toFixed(2) + "x", padX + 2, Y(m) - 3);
      }

      // curve
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, crashed ? "rgba(226,58,78,.28)" : "rgba(255,197,61,.26)");
      grad.addColorStop(1, "rgba(255,197,61,0)");
      ctx.beginPath();
      ctx.moveTo(X(0), Y(1));
      for (let t = 0; t <= elapsedMs; t += 90) ctx.lineTo(X(t / 1000), Y(multiplierAt(t)));
      ctx.lineTo(X(elapsedMs / 1000), Y(mNow));
      ctx.lineTo(X(elapsedMs / 1000), Y(1));
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(X(0), Y(1));
      for (let t = 0; t <= elapsedMs; t += 90) ctx.lineTo(X(t / 1000), Y(multiplierAt(t)));
      ctx.lineTo(X(elapsedMs / 1000), Y(mNow));
      ctx.strokeStyle = crashed ? "#e23a4e" : "#ffc53d";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.stroke();

      // head
      ctx.font = "18px Sora, sans-serif";
      ctx.fillText("⚡", X(elapsedMs / 1000) - 6, Y(mNow) - 8);
    }

    // --- main loop ---
    function tick() {
      if (st.destroyed) return;
      st.raf = requestAnimationFrame(tick);
      const now = Date.now();
      const i = currentRoundIndex(now);
      if (i !== st.roundIdx) onRoundChange(i);
      const ph = roundPhase(i, now);

      if (ph.phase !== st.phase) {
        st.phase = ph.phase;
        if (ph.phase === "betting") spawnBots();
        if (ph.phase === "settled" && !st.settled) settleRound(i);
      }

      el.mult.classList.toggle("crashed", ph.phase === "settled");

      if (ph.phase === "betting") {
        el.mult.textContent = "1.00x";
        el.phase.textContent = `Bets open — next flight in ${(ph.tLeft / 1000).toFixed(1)}s`;
        el.betBar.style.width = (ph.tLeft / BETTING_MS) * 100 + "%";
        el.crashPlace.disabled = false;
        el.ouPlace.disabled = false;
        el.crashPlace.textContent = "Place bet";
        drawGraph(0, false);
      } else if (ph.phase === "flight") {
        const m = multiplierAt(ph.elapsed);
        el.mult.textContent = m.toFixed(2) + "x";
        el.phase.textContent = "IN FLIGHT — cash out!";
        el.betBar.style.width = "0%";
        el.crashPlace.disabled = true;
        el.crashPlace.textContent = "Bets closed — next round soon";
        el.ouPlace.disabled = true;
        // auto-cashouts (mine)
        for (const b of st.myBets.values()) {
          if (b.mode === "crash" && b.status === "placed" && b.autoCashout && m >= b.autoCashout) {
            doCashout(b, b.autoCashout);
          }
        }
        // bots cash out
        for (const bot of st.bots) {
          if (bot.mode === "crash" && !bot._cashed && m >= bot.autoCashout) {
            bot._cashed = true;
            bot.status = "cashed";
            bot.multiplier = bot.autoCashout;
            bot.payout = Math.round(bot.stake * bot.autoCashout);
          }
        }
        drawGraph(ph.elapsed, false);
      } else {
        const cp = crashPointFor(i);
        el.mult.textContent = cp.toFixed(2) + "x";
        el.phase.textContent = `CRASHED — next round in ${(ph.tLeft / 1000).toFixed(1)}s`;
        el.betBar.style.width = "0%";
        el.crashPlace.disabled = true;
        el.crashPlace.textContent = "Bets closed — next round soon";
        el.ouPlace.disabled = true;
        drawGraph(ph.flight, true, cp);
      }

      // cash-out button
      const activeCrash = [...st.myBets.values()].filter(
        (b) => b.mode === "crash" && b.status === "placed" && !b._cashing
      );
      if (ph.phase === "flight" && activeCrash.length) {
        const m = multiplierAt(ph.elapsed);
        const total = activeCrash.reduce((s, b) => s + Math.round(b.stake * m), 0);
        el.cashout.hidden = false;
        el.cashout.textContent = `CASH OUT ${fmtN(total)} @ ${m.toFixed(2)}x`;
      } else {
        el.cashout.hidden = true;
      }
    }
    st.raf = requestAnimationFrame(tick);

    let tableTimer = setInterval(renderTable, 1500);

    return {
      destroy() {
        st.destroyed = true;
        cancelAnimationFrame(st.raf);
        clearInterval(tableTimer);
        window.removeEventListener("resize", resizeCanvas);
        if (st.unRound) st.unRound();
      },
    };
  },
};
