// HeroBet — History page (my bets + transactions)
import { $, $$, esc, fmtN, fmtMult, timeAgo } from "../ui.js";
import { currentUser, subscribeRecentBets, subscribeLedger } from "../backend.js";

const template = `
<section class="page-head">
  <div>
    <h1>HISTORY</h1>
    <p class="sub">Your prediction tickets, demo bets & transactions</p>
  </div>
</section>

<div class="bet-tabs hist-tabs">
  <button class="bet-tab active" data-htab="bets">My tickets</button>
  <button class="bet-tab" data-htab="tx">Transactions</button>
</div>

<div class="card"><div class="live-table" id="histTable"></div></div>
`;

function gameLabel(b) {
  if (b.game === "prediction") return "Prediction";
  if (b.game === "crash") return "Crash demo";
  if (b.game === "dice") return "Dice demo";
  return b.game || "Bet";
}

function marketLabel(b) {
  if (b.game === "prediction") return `${esc(b.marketTitle || "Prediction pool")} · ${esc(b.outcome || b.mode)}`;
  return `${esc(b.mode)}${b.hedge ? ' <span class="you">(hedge)</span>' : ""}`;
}

export const historyPage = {
  mount(outlet) {
    outlet.innerHTML = template;
    let tab = "bets";
    let bets = [];
    let txs = [];
    const box = $("#histTable");

    function render() {
      if (!currentUser()) {
        box.innerHTML = `<div class="empty">Sign in to see your history.</div>`;
        return;
      }
      if (tab === "bets") {
        if (!bets.length) return (box.innerHTML = `<div class="empty">No tickets yet — prediction pools are waiting.</div>`);
        box.innerHTML = `<table><thead><tr>
          <th>Type</th><th>Market / Pick</th><th class="num">Stake</th><th class="num">Mult</th><th class="num">Payout</th><th>Status</th><th></th>
        </tr></thead><tbody>${bets
          .map(
            (b) => `<tr>
            <td>${gameLabel(b)}</td>
            <td>${marketLabel(b)}</td>
            <td class="num">${fmtN(b.stake)}</td>
            <td class="num">${b.multiplier ? fmtMult(b.multiplier) : b.payout && b.stake ? (b.payout / b.stake).toFixed(2) + "x" : "—"}</td>
            <td class="num">${b.payout ? `<span class="win">${fmtN(b.payout)}</span>` : `<span class="loss">—</span>`}</td>
            <td class="dim">${esc(b.status || "placed")}</td>
            <td class="dim">${b.createdAt ? timeAgo(b.createdAt) : ""}</td>
          </tr>`
          )
          .join("")}</tbody></table>`;
      } else {
        if (!txs.length) return (box.innerHTML = `<div class="empty">No transactions yet.</div>`);
        box.innerHTML = `<table><thead><tr>
          <th>Type</th><th>Note</th><th class="num">Amount</th><th class="num">Balance</th><th></th>
        </tr></thead><tbody>${txs
          .map(
            (r) => `<tr>
            <td>${esc(r.type)}</td>
            <td class="dim">${esc(r.note || "")}</td>
            <td class="num ${r.amount >= 0 ? "win" : "loss"}">${r.amount >= 0 ? "+" : ""}${fmtN(r.amount)}</td>
            <td class="num">${fmtN(r.balanceAfter)}</td>
            <td class="dim">${timeAgo(r.createdAt)}</td>
          </tr>`
          )
          .join("")}</tbody></table>`;
      }
    }

    const unBets = subscribeRecentBets((rows) => {
      const u = currentUser();
      bets = rows.filter((b) => u && b.uid === u.uid);
      render();
    }, 80);
    const unTx = subscribeLedger((rows) => {
      txs = rows;
      render();
    });

    $$("[data-htab]").forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.htab;
        $$("[data-htab]").forEach((x) => x.classList.toggle("active", x === b));
        render();
      })
    );

    render();
    return {
      destroy() {
        unBets && unBets();
        unTx && unTx();
      },
    };
  },
};
