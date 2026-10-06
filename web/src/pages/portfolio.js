// HeroBet — portfolio: live marked positions, exposure and realised P&L.

import { instrument, fmtPrice, roundQty, ASSET_CLASS } from "../market/instruments.js";
import { subscribe, getQuote } from "../market/feed.js";
import { subscribePositions, subscribeFills, placeOrder, currentUser } from "../backend.js";
import { onPortfolio } from "../engine/monitor.js";
import { unrealizedPnl, unrealizedPct, executionPrice } from "../engine/paper.js";
import { tradeHref } from "../router.js";
import { openAuthModal } from "../auth-ui.js";
import { $, $$, esc, usd, usdSigned, pct, dirClass, qty as fmtQty, dateTime, toast, confirmDialog } from "../ui.js";

export const portfolioPage = {
  mount(outlet) {
    let positions = [];
    let fills = [];
    let unsubQuotes = null;

    outlet.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div><h1>Portfolio</h1><p class="muted">Everything marked to the live market, refreshed on every tick.</p></div>
          <a class="btn" href="#/markets">Add a position</a>
        </header>

        <div class="kpis">
          <div class="kpi"><span>Equity</span><b id="pEquity">—</b><em class="muted" id="pEquitySub"></em></div>
          <div class="kpi"><span>Unrealised P&amp;L</span><b id="pUnreal">—</b><em class="muted">open positions</em></div>
          <div class="kpi"><span>Realised P&amp;L</span><b id="pReal">—</b><em class="muted">closed trades</em></div>
          <div class="kpi"><span>Margin used</span><b id="pMargin">—</b><em class="muted" id="pMarginSub"></em></div>
        </div>

        <div class="card table-card">
          <div class="card-head"><h3>Open positions</h3><span class="muted small" id="posCount"></span></div>
          <table class="data-table">
            <thead><tr>
              <th>Market</th><th class="num">Size</th><th class="num">Avg entry</th><th class="num">Mark</th>
              <th class="num">Value</th><th class="num">Unrealised</th><th></th>
            </tr></thead>
            <tbody id="posBody"></tbody>
          </table>
        </div>

        <div class="cols-2">
          <div class="card">
            <div class="card-head"><h3>Allocation</h3></div>
            <div id="alloc" class="pad"></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Recent fills</h3><a class="muted small" href="#/orders">All</a></div>
            <table class="data-table compact"><tbody id="fillBody"></tbody></table>
          </div>
        </div>
      </section>
    `;

    if (!currentUser()) {
      outlet.querySelector(".page").insertAdjacentHTML(
        "afterbegin",
        `<div class="notice hero"><div><strong>Sign in to see your book.</strong> Positions live in your Firebase account.</div><button class="btn primary" id="si">Sign in</button></div>`
      );
      $("#si", outlet).addEventListener("click", () => openAuthModal());
    }

    const unsubSummary = onPortfolio((s) => {
      $("#pEquity", outlet).textContent = usd(s.equity);
      $("#pEquitySub", outlet).textContent = `${pct(s.totalPnlPct)} · ${usdSigned(s.totalPnl)} all-time`;
      const u = $("#pUnreal", outlet);
      u.textContent = usdSigned(s.unrealized);
      u.className = dirClass(s.unrealized);
      const r = $("#pReal", outlet);
      r.textContent = usdSigned(s.realized);
      r.className = dirClass(s.realized);
      $("#pMargin", outlet).textContent = usd(s.reserved);
      $("#pMarginSub", outlet).textContent = `${usd(s.available)} free`;
    });

    function paint() {
      const open = positions.filter((p) => p.qty);
      $("#posCount", outlet).textContent = open.length ? `${open.length} open` : "";
      const body = $("#posBody", outlet);
      if (!open.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty">No open positions. <a href="#/markets">Browse markets →</a></td></tr>`;
      } else {
        body.innerHTML = open
          .map((p) => {
            const i = instrument(p.symbol) || { pricePrecision: 2, base: p.symbol, class: "crypto" };
            const mark = getQuote(p.symbol)?.price || p.avgPrice;
            const u = unrealizedPnl(p, mark);
            const val = p.qty * mark;
            return `<tr>
              <td><a class="mkt-name tight" href="${tradeHref(p.symbol)}">
                <span class="pill ${p.qty > 0 ? "buy" : "sell"}">${p.qty > 0 ? "LONG" : "SHORT"}</span>
                <span class="mkt-text"><b>${esc(p.symbol)}</b><em>${esc(ASSET_CLASS[i.class]?.label || "")}</em></span></a></td>
              <td class="num">${fmtQty(Math.abs(p.qty))}</td>
              <td class="num">${fmtPrice(i, p.avgPrice)}</td>
              <td class="num">${fmtPrice(i, mark)}</td>
              <td class="num">${usd(Math.abs(val))}</td>
              <td class="num ${dirClass(u)}"><b>${usdSigned(u)}</b> <small>${pct(unrealizedPct(p, mark))}</small></td>
              <td class="num"><button class="btn tiny danger" data-close="${esc(p.symbol)}">Close</button></td>
            </tr>`;
          })
          .join("");
      }

      $$("[data-close]", body).forEach((b) =>
        b.addEventListener("click", async () => {
          const sym = b.dataset.close;
          const p = positions.find((x) => x.symbol === sym);
          if (!p) return;
          const i = instrument(sym);
          const ok = await confirmDialog(
            "Close position",
            `Market-close <b>${fmtQty(Math.abs(p.qty))} ${esc(sym)}</b> at the live price?`,
            "Close position"
          );
          if (!ok) return;
          const live = getQuote(sym);
          const side = p.qty > 0 ? "sell" : "buy";
          try {
            await placeOrder(
              { symbol: sym, side, type: "market", qty: roundQty(i, Math.abs(p.qty)) },
              live ? { ...live, execPrice: executionPrice(i, side, live) } : null
            );
            toast("Position closed", "ok");
          } catch (e) {
            toast(e.message, "warn");
          }
        })
      );

      paintAllocation(open);
      resub();
    }

    function paintAllocation(open) {
      const el = $("#alloc", outlet);
      if (!open.length) {
        el.innerHTML = `<p class="muted center">Nothing allocated.</p>`;
        return;
      }
      const rows = open
        .map((p) => ({
          symbol: p.symbol,
          value: Math.abs(p.qty * (getQuote(p.symbol)?.price || p.avgPrice)),
          long: p.qty > 0,
        }))
        .sort((a, b) => b.value - a.value);
      const total = rows.reduce((s, r) => s + r.value, 0) || 1;
      el.innerHTML = rows
        .map(
          (r) => `<div class="alloc-row">
            <span class="a-sym">${esc(r.symbol)}</span>
            <div class="a-bar"><i class="${r.long ? "up" : "down"}" style="width:${((r.value / total) * 100).toFixed(1)}%"></i></div>
            <span class="a-val">${((r.value / total) * 100).toFixed(1)}%</span>
          </div>`
        )
        .join("");
    }

    function resub() {
      const syms = positions.filter((p) => p.qty).map((p) => p.symbol);
      if (unsubQuotes) unsubQuotes();
      if (!syms.length) return;
      let raf = false;
      unsubQuotes = subscribe(syms, () => {
        if (raf) return;
        raf = true;
        requestAnimationFrame(() => {
          raf = false;
          paint();
        });
      });
    }

    const unsubPos = subscribePositions((p) => {
      positions = p;
      paint();
    });

    const unsubFills = subscribeFills((f) => {
      fills = f;
      const body = $("#fillBody", outlet);
      if (!f.length) {
        body.innerHTML = `<tr><td class="empty">No fills yet.</td></tr>`;
        return;
      }
      body.innerHTML = f
        .slice(0, 10)
        .map((x) => {
          const i = instrument(x.symbol);
          return `<tr>
            <td><span class="pill ${x.side}">${x.side}</span> <b>${esc(x.symbol)}</b></td>
            <td class="num">${fmtQty(x.qty)} @ ${fmtPrice(i, x.price)}</td>
            <td class="num ${dirClass(x.realized)}">${x.realized ? usdSigned(x.realized) : ""}</td>
            <td class="num muted">${dateTime(x.createdAt)}</td>
          </tr>`;
        })
        .join("");
    }, 20);

    paint();

    return {
      destroy() {
        if (unsubQuotes) unsubQuotes();
        unsubPos();
        unsubFills();
        unsubSummary();
      },
    };
  },
};
