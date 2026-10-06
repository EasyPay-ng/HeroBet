// HeroBet — order blotter: resting orders, full history and executions.

import { instrument, fmtPrice } from "../market/instruments.js";
import { getQuote, subscribe } from "../market/feed.js";
import { subscribeOrders, subscribeFills, cancelOrder, currentUser } from "../backend.js";
import { tradeHref } from "../router.js";
import { openAuthModal } from "../auth-ui.js";
import { $, $$, esc, usd, usdSigned, dirClass, qty as fmtQty, dateTime, toast } from "../ui.js";

const STATUS_LABEL = { open: "Resting", filled: "Filled", cancelled: "Cancelled", rejected: "Rejected" };

export const ordersPage = {
  mount(outlet) {
    let orders = [];
    let fills = [];
    let tab = "open";
    let unsubQuotes = null;

    outlet.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div><h1>Orders</h1><p class="muted">Resting orders trigger automatically when the real market trades through your price.</p></div>
        </header>

        <div class="tabs" id="oTabs">
          <button class="tab on" data-otab="open">Open</button>
          <button class="tab" data-otab="history">Order history</button>
          <button class="tab" data-otab="fills">Executions</button>
        </div>

        <div class="card table-card" id="oPanel"></div>
      </section>
    `;

    if (!currentUser()) {
      outlet.querySelector(".page").insertAdjacentHTML(
        "afterbegin",
        `<div class="notice hero"><div><strong>Sign in to see your orders.</strong></div><button class="btn primary" id="si">Sign in</button></div>`
      );
      $("#si", outlet).addEventListener("click", () => openAuthModal());
    }

    function distance(o) {
      const q = getQuote(o.symbol);
      if (!q) return "—";
      const target = o.type === "limit" ? o.limitPrice : o.stopPrice;
      if (!target) return "—";
      const d = ((target - q.price) / q.price) * 100;
      return `${d > 0 ? "+" : ""}${d.toFixed(2)}%`;
    }

    function paint() {
      const panel = $("#oPanel", outlet);
      if (tab === "open") {
        const open = orders.filter((o) => o.status === "open");
        panel.innerHTML = `
          <div class="card-head"><h3>Resting orders</h3><span class="muted small">${open.length} live</span></div>
          <table class="data-table">
            <thead><tr><th>Market</th><th>Type</th><th class="num">Size</th><th class="num">Trigger</th><th class="num">Last</th><th class="num">Distance</th><th class="num">Placed</th><th></th></tr></thead>
            <tbody>${
              open.length
                ? open
                    .map((o) => {
                      const i = instrument(o.symbol);
                      const q = getQuote(o.symbol);
                      return `<tr>
                        <td><a href="${tradeHref(o.symbol)}"><span class="pill ${o.side}">${o.side}</span> <b>${esc(o.symbol)}</b></a></td>
                        <td class="muted">${esc(o.type)}</td>
                        <td class="num">${fmtQty(o.qty)}</td>
                        <td class="num">${fmtPrice(i, o.type === "limit" ? o.limitPrice : o.stopPrice)}</td>
                        <td class="num">${q ? fmtPrice(i, q.price) : "—"}</td>
                        <td class="num muted">${distance(o)}</td>
                        <td class="num muted">${dateTime(o.createdAt)}</td>
                        <td class="num"><button class="btn tiny ghost" data-cancel="${o.id}">Cancel</button></td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="8" class="empty">No resting orders. Place a limit or stop from the <a href="#/markets">terminal</a>.</td></tr>`
            }</tbody>
          </table>`;
        $$("[data-cancel]", panel).forEach((b) =>
          b.addEventListener("click", async () => {
            await cancelOrder(b.dataset.cancel);
            toast("Order cancelled");
          })
        );
        resub(open.map((o) => o.symbol));
      } else if (tab === "history") {
        panel.innerHTML = `
          <div class="card-head"><h3>Order history</h3></div>
          <table class="data-table">
            <thead><tr><th>Market</th><th>Type</th><th class="num">Size</th><th class="num">Price</th><th>Status</th><th class="num">Realised</th><th class="num">When</th></tr></thead>
            <tbody>${
              orders.length
                ? orders
                    .map((o) => {
                      const i = instrument(o.symbol);
                      const shown = o.status === "filled" ? o.avgFill : o.type === "limit" ? o.limitPrice : o.stopPrice;
                      return `<tr>
                        <td><a href="${tradeHref(o.symbol)}"><span class="pill ${o.side}">${o.side}</span> <b>${esc(o.symbol)}</b></a></td>
                        <td class="muted">${esc(o.type)}</td>
                        <td class="num">${fmtQty(o.qty)}</td>
                        <td class="num">${shown ? fmtPrice(i, shown) : "market"}</td>
                        <td><span class="status ${esc(o.status)}">${STATUS_LABEL[o.status] || o.status}</span>${
                        o.reason ? `<br><small class="muted">${esc(o.reason)}</small>` : ""
                      }</td>
                        <td class="num ${dirClass(o.realized)}">${o.realized ? usdSigned(o.realized) : ""}</td>
                        <td class="num muted">${dateTime(o.createdAt)}</td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="7" class="empty">No orders yet.</td></tr>`
            }</tbody>
          </table>`;
      } else {
        const gross = fills.reduce((s, f) => s + (f.realized || 0), 0);
        const fees = fills.reduce((s, f) => s + (f.fee || 0), 0);
        panel.innerHTML = `
          <div class="card-head"><h3>Executions</h3><span class="muted small">realised ${usdSigned(gross)} · fees ${usd(fees)}</span></div>
          <table class="data-table">
            <thead><tr><th>Market</th><th class="num">Size</th><th class="num">Price</th><th class="num">Value</th><th class="num">Fee</th><th class="num">Realised</th><th class="num">When</th></tr></thead>
            <tbody>${
              fills.length
                ? fills
                    .map((f) => {
                      const i = instrument(f.symbol);
                      return `<tr>
                        <td><a href="${tradeHref(f.symbol)}"><span class="pill ${f.side}">${f.side}</span> <b>${esc(f.symbol)}</b></a></td>
                        <td class="num">${fmtQty(f.qty)}</td>
                        <td class="num">${fmtPrice(i, f.price)}</td>
                        <td class="num">${usd(f.notional || f.qty * f.price)}</td>
                        <td class="num muted">${usd(f.fee || 0)}</td>
                        <td class="num ${dirClass(f.realized)}">${f.realized ? usdSigned(f.realized) : ""}</td>
                        <td class="num muted">${dateTime(f.createdAt)}</td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="7" class="empty">No executions yet.</td></tr>`
            }</tbody>
          </table>`;
      }
    }

    function resub(symbols) {
      if (unsubQuotes) unsubQuotes();
      if (!symbols?.length) return;
      let raf = false;
      unsubQuotes = subscribe([...new Set(symbols)], () => {
        if (raf) return;
        raf = true;
        requestAnimationFrame(() => {
          raf = false;
          if (tab === "open") paint();
        });
      });
    }

    $$("[data-otab]", outlet).forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.otab;
        $$("[data-otab]", outlet).forEach((x) => x.classList.toggle("on", x === b));
        paint();
      })
    );

    const unsubOrders = subscribeOrders((o) => {
      orders = o;
      paint();
    });
    const unsubFills = subscribeFills((f) => {
      fills = f;
      if (tab === "fills") paint();
    });

    paint();

    return {
      destroy() {
        if (unsubQuotes) unsubQuotes();
        unsubOrders();
        unsubFills();
      },
    };
  },
};
