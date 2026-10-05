// HeroBet — HERO DICE (HeroBet Original)
// Instant single-player dice: pick a target, roll under/over, 99% RTP.
import { $, $$, esc, fmtN, toast } from "../ui.js";
import { currentUser, placeBet, settleBet } from "../backend.js";
import { openAuthModal } from "../auth-ui.js";

const template = `
<section class="page-head">
  <div>
    <h1>HERO DICE</h1>
    <p class="sub">HeroBet Original · pick your line, roll the bolt ⚡</p>
  </div>
  <div class="page-head-right"><span class="chip gold">99% RTP</span></div>
</section>

<div class="dice-layout">
  <section class="card dice-stage">
    <div class="dice-result" id="diceResult">—</div>
    <div class="dice-track">
      <div class="dice-zone lose" id="diceLoseZone"></div>
      <div class="dice-zone win" id="diceWinZone"></div>
      <div class="dice-marker" id="diceMarker" hidden>⚡</div>
    </div>
    <div class="dice-strip" id="diceStrip"></div>
  </section>

  <aside class="card dice-panel">
    <div class="dice-dir">
      <button class="bet-tab active" data-dir="under">Roll Under</button>
      <button class="bet-tab" data-dir="over">Roll Over</button>
    </div>
    <label class="field">
      <span>Target (2 – 98)</span>
      <input id="diceTarget" type="range" min="2" max="98" value="49" step="1" />
      <div class="dice-quote" id="diceQuote"></div>
    </label>
    <label class="field">
      <span>Stake (₦)</span>
      <div class="chips-row">
        <button class="mini" data-dstake="500">500</button>
        <button class="mini" data-dstake="1000">1k</button>
        <button class="mini" data-dstake="5000">5k</button>
      </div>
      <input id="diceStake" type="number" min="100" max="100000" step="100" value="1000" />
    </label>
    <button id="diceRoll" class="btn wide">ROLL ⚡</button>
    <p class="dice-note">Rolls use your browser's secure RNG. Server-side provable fairness lands with the Cloud Functions milestone.</p>
  </aside>
</div>
`;

export const dicePage = {
  mount(outlet) {
    outlet.innerHTML = template;
    const el = {
      result: $("#diceResult"),
      marker: $("#diceMarker"),
      track: $(".dice-track"),
      winZone: $("#diceWinZone"),
      loseZone: $("#diceLoseZone"),
      strip: $("#diceStrip"),
      quote: $("#diceQuote"),
      target: $("#diceTarget"),
      stake: $("#diceStake"),
      roll: $("#diceRoll"),
    };
    let dir = "under";
    const history = [];

    function quote() {
      const t = Number(el.target.value);
      const chance = dir === "under" ? t : 100 - t;
      const mult = 0.99 / (chance / 100);
      el.quote.innerHTML = `Win chance <strong>${chance.toFixed(2)}%</strong> · payout <strong>${mult.toFixed(4)}x</strong>`;
      el.winZone.style.width = chance + "%";
      el.loseZone.style.width = 100 - chance + "%";
      if (dir === "under") {
        el.winZone.style.order = "0";
        el.loseZone.style.order = "1";
      } else {
        el.loseZone.style.order = "0";
        el.winZone.style.order = "1";
      }
    }
    quote();
    el.target.addEventListener("input", quote);
    $$("[data-dir]").forEach((b) =>
      b.addEventListener("click", () => {
        dir = b.dataset.dir;
        $$("[data-dir]").forEach((x) => x.classList.toggle("active", x === b));
        quote();
      })
    );
    $$("[data-dstake]").forEach((b) => b.addEventListener("click", () => (el.stake.value = b.dataset.dstake)));

    el.roll.addEventListener("click", async () => {
      if (!currentUser()) return openAuthModal();
      const stake = Math.round(Number(el.stake.value));
      const t = Number(el.target.value);
      if (!(stake >= 100) || stake > 100000) return toast("Stake must be ₦100 – ₦100,000", "warn");
      const chance = dir === "under" ? t : 100 - t;
      const mult = 0.99 / (chance / 100);
      el.roll.disabled = true;
      try {
        const roll = Math.round((window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * 10000) / 100;
        const won = dir === "under" ? roll < t : roll > t;
        const payout = won ? Math.round(stake * mult) : 0;
        await placeBet({
          game: "dice",
          mode: `${dir} ${t}`,
          stake,
          target: t,
          dir,
          roll,
        }).then(async (id) => {
          // dice settles instantly: credit payout back
          if (won) {
            await settleBet(id, { status: "won", multiplier: Number(mult.toFixed(4)), payout }, payout, `Dice ${dir} ${t} win`);
          }
        });
        // visuals
        el.result.textContent = roll.toFixed(2);
        el.result.classList.toggle("won", won);
        el.result.classList.toggle("lost", !won);
        el.marker.hidden = false;
        el.marker.style.left = `calc(${roll}% - 10px)`;
        history.unshift({ roll, won });
        if (history.length > 14) history.pop();
        el.strip.innerHTML = history
          .map((x) => `<span class="pill ${x.won ? "high" : "low"}">${x.roll.toFixed(2)}</span>`)
          .join("");
        if (won) toast(`Rolled ${roll.toFixed(2)} — ${fmtN(payout)} 🎉`, "ok");
      } catch (e) {
        if (e.message === "INSUFFICIENT") toast("Not enough balance — top up in the Wallet", "err");
        else toast(e.message, "err");
      } finally {
        el.roll.disabled = false;
      }
    });

    return {};
  },
};
