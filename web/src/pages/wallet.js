// HeroBet — Wallet page (balance, simulated deposit/withdraw, ledger)
import { $, fmtN, esc, timeAgo, toast } from "../ui.js";
import { currentUser, subscribeWallet, subscribeLedger, credit, debit } from "../backend.js";
import { openAuthModal } from "../auth-ui.js";

const template = `
<section class="page-head">
  <div>
    <h1>WALLET</h1>
    <p class="sub">Deposits, withdrawals & every transaction</p>
  </div>
  <div class="page-head-right"><span class="chip">NGN · simulated</span></div>
</section>

<div class="wallet-layout">
  <div class="card balance-card" id="balanceCard"></div>

  <div class="card">
    <div class="card-head"><h2>DEPOSIT</h2><span class="chip gold">instant · demo</span></div>
    <div class="chips-row">
      <button class="mini" data-dep="1000">₦1,000</button>
      <button class="mini" data-dep="5000">₦5,000</button>
      <button class="mini" data-dep="10000">₦10,000</button>
      <button class="mini" data-dep="50000">₦50,000</button>
    </div>
    <label class="field">
      <span>Custom amount (₦)</span>
      <input id="depAmount" type="number" min="100" step="100" placeholder="e.g. 2500" />
    </label>
    <button class="btn wide" id="depBtn">Simulate deposit</button>
  </div>

  <div class="card">
    <div class="card-head"><h2>WITHDRAW</h2><span class="chip">demo</span></div>
    <label class="field">
      <span>Amount (₦) · min ₦1,000</span>
      <input id="wdAmount" type="number" min="1000" step="100" placeholder="e.g. 5000" />
    </label>
    <button class="btn ghost wide" id="wdBtn">Simulate withdrawal</button>
    <p class="bet-note">Real payments (Paystack / Flutterwave / bank transfer) arrive with the payments milestone — until then all money on HeroBet is simulated demo credit.</p>
  </div>
</div>

<section class="sec">
  <div class="sec-head"><h2>TRANSACTIONS</h2></div>
  <div class="card"><div class="live-table" id="ledgerTable"></div></div>
</section>
`;

function renderLedger(rows) {
  if (!rows.length) return `<div class="empty">No transactions yet.</div>`;
  const label = {
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    bet: "Bet placed",
    payout: "Payout",
    "demo-grant": "Welcome credit",
    "rain-demo": "Gift Drop demo win",
  };
  return `<table><thead><tr>
    <th>Type</th><th>Note</th><th class="num">Amount</th><th class="num">Balance</th><th></th>
  </tr></thead><tbody>${rows
    .map(
      (r) => `<tr>
      <td>${label[r.type] || esc(r.type)}</td>
      <td class="dim">${esc(r.note || "")}</td>
      <td class="num ${r.amount >= 0 ? "win" : "loss"}">${r.amount >= 0 ? "+" : ""}${fmtN(r.amount)}</td>
      <td class="num">${fmtN(r.balanceAfter)}</td>
      <td class="dim">${timeAgo(r.createdAt)}</td>
    </tr>`
    )
    .join("")}</tbody></table>`;
}

export const walletPage = {
  mount(outlet) {
    outlet.innerHTML = template;

    const renderBalance = (w) => {
      const u = currentUser();
      $("#balanceCard").innerHTML = !u
        ? `<p class="dim">Sign in to open your wallet.</p><button class="btn wide" id="wSignin">Sign in</button>`
        : `<div class="wallet-big">${w ? fmtN(w.balance) : "—"}</div>
           <p class="dim">${esc(u.name)} · demo balance (simulated NGN)</p>`;
      const b = $("#wSignin");
      if (b) b.addEventListener("click", openAuthModal);
    };

    let unWallet = subscribeWallet(renderBalance);
    renderBalance(null);

    let unLedger = subscribeLedger((rows) => ($("#ledgerTable").innerHTML = renderLedger(rows)));

    $("#depBtn").addEventListener("click", async () => {
      if (!currentUser()) return openAuthModal();
      const amount = Math.round(Number($("#depAmount").value));
      if (!(amount >= 100)) return toast("Enter an amount of at least ₦100", "warn");
      try {
        await credit({ type: "deposit", amount, note: "Simulated deposit" });
        toast(`Deposited ${fmtN(amount)} ⚡`, "ok");
        $("#depAmount").value = "";
      } catch (e) {
        toast(e.message, "err");
      }
    });

    document.querySelectorAll("[data-dep]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!currentUser()) return openAuthModal();
        const amount = Number(b.dataset.dep);
        try {
          await credit({ type: "deposit", amount, note: "Simulated deposit" });
          toast(`Deposited ${fmtN(amount)} ⚡`, "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      })
    );

    $("#wdBtn").addEventListener("click", async () => {
      if (!currentUser()) return openAuthModal();
      const amount = Math.round(Number($("#wdAmount").value));
      if (!(amount >= 1000)) return toast("Minimum withdrawal is ₦1,000", "warn");
      try {
        await debit({ type: "withdrawal", amount, note: "Simulated withdrawal" });
        toast(`Withdrawal of ${fmtN(amount)} requested`, "ok");
        $("#wdAmount").value = "";
      } catch (e) {
        if (e.message === "INSUFFICIENT") toast("Not enough balance for that withdrawal", "err");
        else toast(e.message, "err");
      }
    });

    return {
      destroy() {
        unWallet && unWallet();
        unLedger && unLedger();
      },
    };
  },
};
