// HeroBet — peer-to-peer prediction pools.
// Operators do not underwrite wins here: every payout is calculated from the
// escrowed pool of participant stakes, less the platform fee.
import { $, $$, esc, fmtN, timeAgo, toast } from "../ui.js";
import { currentUser, placeBet, settleBet, subscribePredictionBets } from "../backend.js";
import { openAuthModal } from "../auth-ui.js";
import {
  getPredictionMarkets,
  poolTotals,
  estimatePayout,
  settlementForBet,
  marketStatus,
  formatCountdown,
  MIN_PREDICTION_STAKE,
  MAX_PREDICTION_STAKE,
  POOL_FEE_RATE,
} from "../prediction-markets.js";

function outcomeLabel(market, id) {
  return market.outcomes.find((o) => o.id === id)?.short || id;
}

function marketTime(ts) {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

function template() {
  return `
<section class="page-head">
  <div>
    <h1>PREDICTION POOLS</h1>
    <p class="sub">Peer-to-peer markets: winners are paid from the pool, never from the operator's pocket.</p>
  </div>
  <div class="page-head-right">
    <span class="chip gold">${Math.round(POOL_FEE_RATE * 100)}% platform fee</span>
    <span class="chip">Pool-funded payouts</span>
  </div>
</section>

<section class="pool-explainer card">
  <div>
    <span class="promo-badge">NO HOUSE LIABILITY MODEL</span>
    <h2>How the money works</h2>
    <p>Every stake goes into that market's escrow pool. When the result is declared, winning tickets split the whole pool after HeroBet's fee. If the pool does not contain enough money, nobody is promised fixed odds — so HeroBet is not paying winners from your personal pocket.</p>
  </div>
  <div class="pool-steps">
    <div><strong>1</strong><span>Players stake Yes / No / Draw</span></div>
    <div><strong>2</strong><span>Pool closes and result is resolved</span></div>
    <div><strong>3</strong><span>Winners share losers' stakes minus fee</span></div>
  </div>
</section>

<section class="sec">
  <div class="sec-head"><h2>OPEN MARKETS</h2><span class="chip gold">demo liquidity shown</span></div>
  <div id="marketsGrid" class="markets-grid"></div>
</section>

<section class="sec">
  <div class="sec-head"><h2>MY POOL TICKETS</h2><span class="chip">settle after close</span></div>
  <div class="card"><div class="live-table" id="myPredictionTickets"></div></div>
</section>
`;
}

function ticketRows(markets, rowsByMarket) {
  const u = currentUser();
  if (!u) return `<div class="empty">Sign in to see your prediction tickets.</div>`;
  const rows = markets.flatMap((market) =>
    (rowsByMarket.get(market.id) || [])
      .filter((b) => b.uid === u.uid)
      .map((b) => ({ ...b, market }))
  );
  if (!rows.length) return `<div class="empty">No prediction tickets yet — choose a side in an open pool.</div>`;
  return `<table><thead><tr>
    <th>Market</th><th>Pick</th><th class="num">Stake</th><th class="num">Payout</th><th>Status</th><th></th>
  </tr></thead><tbody>${rows
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(
      (b) => `<tr>
      <td>${esc(b.market.title)}</td>
      <td>${esc(outcomeLabel(b.market, b.outcome || b.mode))}</td>
      <td class="num">${fmtN(b.stake)}</td>
      <td class="num">${b.payout ? `<span class="win">${fmtN(b.payout)}</span>` : "—"}</td>
      <td class="dim">${esc(b.status || "placed")}</td>
      <td class="dim">${b.createdAt ? timeAgo(b.createdAt) : ""}</td>
    </tr>`
    )
    .join("")}</tbody></table>`;
}

function renderMarketCard(market, bets, state) {
  const totals = poolTotals(market, bets);
  const status = marketStatus(market);
  const stake = state.stakes.get(market.id) || 1000;
  const selected = state.selected.get(market.id) || market.outcomes[0].id;
  const selectedEstimate = estimatePayout(market, bets, selected, stake);
  const totalTickets = bets.filter((b) => b.status === "placed" || b.status === "won" || b.status === "lost").length;
  const result = status === "settled" ? outcomeLabel(market, market.demoOutcome) : "Hidden until settlement";
  const countdownText =
    status === "open"
      ? `Closes in ${formatCountdown(market.closeAt - Date.now())}`
      : status === "closed"
        ? `Settles in ${formatCountdown(market.settlesAt - Date.now())}`
        : `Settled · ${result} won`;

  return `<article class="market-card" data-market-card="${esc(market.id)}">
    <div class="market-top">
      <div>
        <div class="market-kicker"><span>${esc(market.category)}</span><span>${esc(market.badge)}</span></div>
        <h3>${esc(market.title)}</h3>
        <p>${esc(market.description)}</p>
      </div>
      <span class="chip ${status === "open" ? "gold" : ""}" data-countdown="${esc(market.id)}">${countdownText}</span>
    </div>

    <div class="pool-meter">
      <div class="pool-meter-head"><span>Total pool</span><strong>${fmtN(totals.total)}</strong></div>
      <div class="pool-bar" aria-hidden="true">
        ${market.outcomes
          .map((o) => {
            const pct = totals.total ? Math.max(4, (totals.byOutcome[o.id] / totals.total) * 100) : 0;
            return `<span style="width:${pct}%"></span>`;
          })
          .join("")}
      </div>
      <div class="pool-fee-line">Fee reserve: ${fmtN(totals.fee)} · Distributable: ${fmtN(totals.distributable)} · Tickets: ${totalTickets}</div>
    </div>

    <div class="outcome-grid">
      ${market.outcomes
        .map((o) => {
          const pct = totals.total ? (totals.byOutcome[o.id] / totals.total) * 100 : 0;
          const estimate = estimatePayout(market, bets, o.id, stake);
          const isSelected = selected === o.id;
          const isWinner = status === "settled" && market.demoOutcome === o.id;
          return `<button class="outcome-btn ${isSelected ? "selected" : ""} ${isWinner ? "winner" : ""}" data-pick="${esc(o.id)}" data-market="${esc(market.id)}" ${status !== "open" ? "disabled" : ""}>
            <span>${esc(o.label)}</span>
            <strong>${fmtN(totals.byOutcome[o.id] || 0)}</strong>
            <em>${pct.toFixed(1)}% of pool · est. ${estimate.multiplier ? estimate.multiplier.toFixed(2) : "0.00"}x</em>
          </button>`;
        })
        .join("")}
    </div>

    <div class="market-bet-row">
      <label class="field">
        <span>Your stake (₦)</span>
        <input data-stake-input="${esc(market.id)}" type="number" min="${MIN_PREDICTION_STAKE}" max="${MAX_PREDICTION_STAKE}" step="100" value="${stake}" ${status !== "open" ? "disabled" : ""} />
      </label>
      <div class="estimate-box">
        <span>If your pick wins</span>
        <strong>${fmtN(selectedEstimate.payout)}</strong>
        <em>${selectedEstimate.multiplier ? selectedEstimate.multiplier.toFixed(2) : "0.00"}x estimated return</em>
      </div>
      <button class="btn" data-place-market="${esc(market.id)}" ${status !== "open" ? "disabled" : ""}>Back ${esc(outcomeLabel(market, selected))}</button>
    </div>

    <div class="market-foot">
      <span>Close: ${marketTime(market.closeAt)}</span>
      <span>Result: ${esc(result)}</span>
      <span>Model: pari-mutuel pool</span>
    </div>
  </article>`;
}

export const predictionsPage = {
  mount(outlet) {
    outlet.innerHTML = template();

    const markets = getPredictionMarkets();
    const rowsByMarket = new Map(markets.map((m) => [m.id, []]));
    const state = {
      selected: new Map(markets.map((m) => [m.id, m.outcomes[0].id])),
      stakes: new Map(markets.map((m) => [m.id, 1000])),
      lastStatus: new Map(markets.map((m) => [m.id, marketStatus(m)])),
      settling: new Set(),
    };

    const grid = $("#marketsGrid");
    const tickets = $("#myPredictionTickets");
    let destroyed = false;

    function marketById(id) {
      return markets.find((m) => m.id === id);
    }

    function render() {
      if (destroyed) return;
      grid.innerHTML = markets.map((m) => renderMarketCard(m, rowsByMarket.get(m.id) || [], state)).join("");
      tickets.innerHTML = ticketRows(markets, rowsByMarket);
    }

    async function settleMine(market) {
      if (marketStatus(market) !== "settled" || state.settling.has(market.id)) return;
      const u = currentUser();
      if (!u) return;
      const rows = rowsByMarket.get(market.id) || [];
      const mine = rows.filter((b) => b.uid === u.uid && b.status === "placed");
      if (!mine.length) return;
      state.settling.add(market.id);
      try {
        for (const bet of mine) {
          const result = settlementForBet(market, rows, bet);
          await settleBet(
            bet.id,
            {
              status: result.won ? "won" : "lost",
              resolvedOutcome: market.demoOutcome,
              payout: result.payout,
              poolTotal: result.totals.total,
              platformFee: result.totals.fee,
              settledAt: Date.now(),
            },
            result.payout,
            `Prediction pool · ${market.title}`
          );
          if (result.won) toast(`${outcomeLabel(market, market.demoOutcome)} won — credited ${fmtN(result.payout)}`, "ok");
          else toast(`${outcomeLabel(market, market.demoOutcome)} won — your ${outcomeLabel(market, bet.outcome || bet.mode)} ticket lost`, "warn");
        }
      } catch (e) {
        toast(e.message || "Prediction settlement failed", "err");
      } finally {
        state.settling.delete(market.id);
      }
    }

    function updateCountdowns() {
      let needsRender = false;
      for (const market of markets) {
        const status = marketStatus(market);
        if (state.lastStatus.get(market.id) !== status) {
          state.lastStatus.set(market.id, status);
          needsRender = true;
        }
        settleMine(market);
      }
      if (needsRender) return render();

      $$('[data-countdown]').forEach((el) => {
        const market = marketById(el.dataset.countdown);
        if (!market) return;
        const status = marketStatus(market);
        el.textContent =
          status === "open"
            ? `Closes in ${formatCountdown(market.closeAt - Date.now())}`
            : status === "closed"
              ? `Settles in ${formatCountdown(market.settlesAt - Date.now())}`
              : `Settled · ${outcomeLabel(market, market.demoOutcome)} won`;
      });
    }

    const unsubs = markets.map((market) =>
      subscribePredictionBets(market.id, (rows) => {
        rowsByMarket.set(market.id, rows);
        render();
        settleMine(market);
      })
    );

    grid.addEventListener("click", async (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        const market = marketById(pick.dataset.market);
        if (!market || marketStatus(market) !== "open") return;
        state.selected.set(market.id, pick.dataset.pick);
        render();
        return;
      }

      const place = e.target.closest("[data-place-market]");
      if (!place) return;
      const market = marketById(place.dataset.placeMarket);
      if (!market) return;
      if (!currentUser()) return openAuthModal();
      if (marketStatus(market) !== "open") return toast("This market is already closed.", "warn");
      const input = $(`[data-stake-input="${market.id}"]`, grid);
      const stake = Math.round(Number(input?.value || state.stakes.get(market.id) || 0));
      if (!(stake >= MIN_PREDICTION_STAKE) || stake > MAX_PREDICTION_STAKE) {
        return toast(`Stake must be ${fmtN(MIN_PREDICTION_STAKE)} – ${fmtN(MAX_PREDICTION_STAKE)}`, "warn");
      }
      const outcome = state.selected.get(market.id) || market.outcomes[0].id;
      try {
        await placeBet({
          game: "prediction",
          marketId: market.id,
          marketTitle: market.title,
          category: market.category,
          mode: outcome,
          outcome,
          stake,
          feeRate: market.feeRate,
          closeAt: market.closeAt,
          settlesAt: market.settlesAt,
          payoutModel: "pool",
        });
        toast(`Ticket placed: ${outcomeLabel(market, outcome)} · ${fmtN(stake)} in the pool`, "ok");
      } catch (e2) {
        if (e2.message === "INSUFFICIENT") toast("Not enough balance — top up in the Wallet", "err");
        else if (e2.message === "AUTH") openAuthModal();
        else toast(e2.message, "err");
      }
    });

    grid.addEventListener("input", (e) => {
      const input = e.target.closest("[data-stake-input]");
      if (!input) return;
      state.stakes.set(input.dataset.stakeInput, Math.round(Number(input.value || 0)));
      const market = marketById(input.dataset.stakeInput);
      if (!market) return;
      const card = input.closest("[data-market-card]");
      if (!card) return;
      const selected = state.selected.get(market.id) || market.outcomes[0].id;
      const estimate = estimatePayout(market, rowsByMarket.get(market.id) || [], selected, Number(input.value));
      const box = $(".estimate-box", card);
      if (box) {
        box.innerHTML = `<span>If your pick wins</span><strong>${fmtN(estimate.payout)}</strong><em>${estimate.multiplier ? estimate.multiplier.toFixed(2) : "0.00"}x estimated return</em>`;
      }
    });

    render();
    const timer = setInterval(updateCountdowns, 1000);

    return {
      destroy() {
        destroyed = true;
        clearInterval(timer);
        unsubs.forEach((un) => un && un());
      },
    };
  },
};
