// HeroBet — cash account: balances, paper top-ups and the full ledger.

import { subscribeAccount, subscribeLedger, deposit, resetAccount, currentUser, STARTING_CASH } from "../backend.js";
import { onPortfolio } from "../engine/monitor.js";
import { usdRates } from "../market/fx.js";
import { openAuthModal } from "../auth-ui.js";
import { $, $$, esc, usd, usdSigned, pct, dirClass, dateTime, toast, confirmDialog } from "../ui.js";

const LOCAL_CCY = "NGN";

export const walletPage = {
  mount(outlet) {
    let account = null;
    let ngnRate = 0;

    outlet.innerHTML = `
      <section class="page narrow">
        <header class="page-head">
          <div><h1>Cash &amp; ledger</h1><p class="muted">Paper capital in USD. Every movement is journalled.</p></div>
        </header>

        <div class="card balance-card">
          <div class="bal-main">
            <span class="muted">Account equity</span>
            <div class="bal-big" id="wEquity">—</div>
            <div class="muted" id="wLocal"></div>
          </div>
          <dl class="bal-grid">
            <div><dt>Settled cash</dt><dd id="wCash">—</dd></div>
            <div><dt>Margin reserved</dt><dd id="wReserved">—</dd></div>
            <div><dt>Buying power</dt><dd id="wAvail">—</dd></div>
            <div><dt>Total P&amp;L</dt><dd id="wPnl">—</dd></div>
          </dl>
        </div>

        <div class="card">
          <div class="card-head"><h3>Add paper capital</h3></div>
          <div class="pad">
            <p class="muted">Top-ups are simulated book entries — HeroBet never accepts real deposits and holds no client funds.</p>
            <div class="row gap wrap mt">
              ${[1000, 5000, 25000, 100000].map((v) => `<button class="btn" data-dep="${v}">+ ${usd(v, 0)}</button>`).join("")}
            </div>
            <div class="row gap mt">
              <input class="input" id="depCustom" type="number" min="1" step="100" placeholder="Custom amount (USD)" />
              <button class="btn primary" id="depBtn">Add</button>
            </div>
          </div>
        </div>

        <div class="card table-card">
          <div class="card-head"><h3>Ledger</h3><span class="muted small">newest first</span></div>
          <table class="data-table">
            <thead><tr><th>Entry</th><th class="num">Amount</th><th class="num">Balance after</th><th class="num">When</th></tr></thead>
            <tbody id="ledBody"></tbody>
          </table>
        </div>

        <div class="card danger-zone">
          <div class="card-head"><h3>Danger zone</h3></div>
          <div class="pad row between center wrap gap">
            <p class="muted">Reset wipes positions, orders and fills, then restores the ${usd(STARTING_CASH, 0)} opening balance.</p>
            <button class="btn danger" id="resetBtn">Reset account</button>
          </div>
        </div>
      </section>
    `;

    if (!currentUser()) {
      outlet.querySelector(".page").insertAdjacentHTML(
        "afterbegin",
        `<div class="notice hero"><div><strong>Sign in to open a cash account.</strong></div><button class="btn primary" id="si">Sign in</button></div>`
      );
      $("#si", outlet).addEventListener("click", () => openAuthModal());
    }

    usdRates()
      .then((t) => {
        ngnRate = t.rates?.[LOCAL_CCY] || 0;
        paintLocal();
      })
      .catch(() => {});

    let equity = 0;
    function paintLocal() {
      const el = $("#wLocal", outlet);
      if (!el) return;
      el.textContent = ngnRate
        ? `≈ ₦${(equity * ngnRate).toLocaleString("en-NG", { maximumFractionDigits: 0 })} at the live USD/${LOCAL_CCY} rate`
        : "";
    }

    const unsubSummary = onPortfolio((s) => {
      equity = s.equity;
      $("#wEquity", outlet).textContent = usd(s.equity);
      $("#wCash", outlet).textContent = usd(s.cash);
      $("#wReserved", outlet).textContent = usd(s.reserved);
      $("#wAvail", outlet).textContent = usd(s.available);
      const p = $("#wPnl", outlet);
      p.textContent = `${usdSigned(s.totalPnl)} (${pct(s.totalPnlPct)})`;
      p.className = dirClass(s.totalPnl);
      paintLocal();
    });

    const unsubAcct = subscribeAccount((a) => (account = a));

    const doDeposit = async (amount) => {
      if (!currentUser()) return openAuthModal();
      try {
        await deposit(amount);
        toast(`Added ${usd(amount, 0)} paper capital`, "ok");
      } catch (e) {
        toast(e.message, "warn");
      }
    };

    $$("[data-dep]", outlet).forEach((b) => b.addEventListener("click", () => doDeposit(Number(b.dataset.dep))));
    $("#depBtn", outlet).addEventListener("click", () => {
      const v = Number($("#depCustom", outlet).value);
      if (!(v > 0)) return toast("Enter an amount", "warn");
      $("#depCustom", outlet).value = "";
      doDeposit(v);
    });

    $("#resetBtn", outlet).addEventListener("click", async () => {
      if (!currentUser()) return openAuthModal();
      const ok = await confirmDialog(
        "Reset trading account",
        "This deletes every position, order and fill and restores your opening balance. It cannot be undone.",
        "Reset everything"
      );
      if (!ok) return;
      try {
        await resetAccount();
        toast("Account reset", "ok");
      } catch (e) {
        toast(e.message, "warn");
      }
    });

    const unsubLedger = subscribeLedger((rows) => {
      const body = $("#ledBody", outlet);
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="4" class="empty">No entries yet.</td></tr>`;
        return;
      }
      body.innerHTML = rows
        .map(
          (l) => `<tr>
            <td><span class="status ${esc(l.type)}">${esc(l.type)}</span> <span class="muted">${esc(l.note || "")}</span></td>
            <td class="num ${dirClass(l.amount)}">${usdSigned(l.amount)}</td>
            <td class="num">${usd(l.balanceAfter)}</td>
            <td class="num muted">${dateTime(l.createdAt)}</td>
          </tr>`
        )
        .join("");
    });

    return {
      destroy() {
        unsubSummary();
        unsubAcct();
        unsubLedger();
      },
    };
  },
};
