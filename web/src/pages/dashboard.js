// HeroBet — desk overview.

import { instrument, fmtPrice, ASSET_CLASS } from "../market/instruments.js";
import { subscribe, getQuote, warm, onStatus, allQuotes } from "../market/feed.js";
import {
  subscribeWatchlist,
  subscribePositions,
  subscribeTape,
  subscribeLeaderboard,
  currentUser,
  mode,
} from "../backend.js";
import { onPortfolio } from "../engine/monitor.js";
import { unrealizedPnl, unrealizedPct } from "../engine/paper.js";
import { tradeHref } from "../router.js";
import { openAuthModal } from "../auth-ui.js";
import { $, $$, esc, usd, usdSigned, pct, dirClass, idKey, qty as fmtQty, timeAgo, flash } from "../ui.js";

export const dashboardPage = {
  mount(outlet) {
    let watchlist = [];
    let positions = [];
    let unsubQuotes = null;

    outlet.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <h1>Trading desk</h1>
            <p class="muted" id="deskSub">Paper capital, real prices.</p>
          </div>
          <div class="row gap">
            <a class="btn" href="#/markets">Browse markets</a>
            <a class="btn primary" href="${tradeHref("BTC-USD")}">Open terminal</a>
          </div>
        </header>

        <div id="signedOut"></div>

        <div class="kpis" id="kpis">
          <div class="kpi"><span>Equity</span><b id="kEquity">—</b><em id="kEquitySub" class="muted"></em></div>
          <div class="kpi"><span>Total P&amp;L</span><b id="kPnl">—</b><em id="kPnlPct" class="muted"></em></div>
          <div class="kpi"><span>Buying power</span><b id="kAvail">—</b><em class="muted">cash minus margin</em></div>
          <div class="kpi"><span>Open risk</span><b id="kExp">—</b><em class="muted" id="kExpSub">gross exposure</em></div>
        </div>

        <div class="cols-2">
          <div class="card">
            <div class="card-head"><h3>Watchlist</h3><a class="muted small" href="#/markets">Edit</a></div>
            <table class="data-table"><tbody id="wlBody"></tbody></table>
          </div>

          <div class="card">
            <div class="card-head"><h3>Open positions</h3><a class="muted small" href="#/portfolio">All</a></div>
            <table class="data-table"><tbody id="posBody"></tbody></table>
          </div>
        </div>

        <div class="cols-2">
          <div class="card">
            <div class="card-head"><h3>Top movers · 24h</h3></div>
            <div id="movers" class="movers"></div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Live tape</h3><span class="muted small">every fill on this desk</span></div>
            <div id="tape" class="tape big"></div>
          </div>
        </div>

        <div class="cols-2">
          <div class="card">
            <div class="card-head"><h3>Leaderboard</h3><span class="muted small">by return</span></div>
            <table class="data-table"><tbody id="lbBody"></tbody></table>
          </div>

          <div class="card">
            <div class="card-head"><h3>Market data</h3><a class="muted small" href="#/settings">Settings</a></div>
            <div id="feedStatus" class="pad"></div>
          </div>
        </div>
      </section>
    `;

    // ── signed-out prompt ──
    if (!currentUser()) {
      $("#signedOut", outlet).innerHTML = `
        <div class="notice hero">
          <div>
            <strong>Open a desk to start trading.</strong>
            Guest accounts are instant and come with $100,000 of paper capital marked against real market prices.
          </div>
          <button class="btn primary" id="openAcct">Open account</button>
        </div>`;
      $("#openAcct", outlet).addEventListener("click", () => openAuthModal("signup"));
    }

    // ── KPIs ──
    const unsubPortfolio = onPortfolio((s) => {
      $("#kEquity", outlet).textContent = usd(s.equity);
      $("#kEquitySub", outlet).textContent = `${usd(s.cash)} cash · ${usd(s.positionsValue)} positions`;
      const pnl = $("#kPnl", outlet);
      pnl.textContent = usdSigned(s.totalPnl);
      pnl.className = dirClass(s.totalPnl);
      $("#kPnlPct", outlet).textContent = `${pct(s.totalPnlPct)} since opening`;
      $("#kAvail", outlet).textContent = usd(s.available);
      $("#kExp", outlet).textContent = usd(s.grossExposure);
      $("#kExpSub", outlet).textContent = `long ${usd(s.longExposure)} · short ${usd(s.shortExposure)}`;
    });

    // ── watchlist ──
    function paintWatchlist() {
      const body = $("#wlBody", outlet);
      if (!watchlist.length) {
        body.innerHTML = `<tr><td class="empty">No markets starred yet — <a href="#/markets">add some</a>.</td></tr>`;
        return;
      }
      body.innerHTML = watchlist
        .map((s) => instrument(s))
        .filter(Boolean)
        .map((i) => {
          const q = getQuote(i.symbol);
          const k = idKey(i.symbol);
          return `<tr>
            <td><a class="mkt-name tight" href="${tradeHref(i.symbol)}"><span class="sym-badge ${i.class}">${ASSET_CLASS[i.class].icon}</span><span class="mkt-text"><b>${esc(i.symbol)}</b><em>${esc(i.name)}</em></span></a></td>
            <td class="num" id="wp-${k}">${q ? fmtPrice(i, q.price) : "—"}</td>
            <td class="num ${q ? dirClass(q.changePct) : ""}" id="wc-${k}">${q ? pct(q.changePct) : "—"}</td>
          </tr>`;
        })
        .join("");
      resub();
    }

    // ── positions ──
    function paintPositions() {
      const body = $("#posBody", outlet);
      const open = positions.filter((p) => p.qty);
      if (!open.length) {
        body.innerHTML = `<tr><td class="empty">Flat. <a href="#/markets">Find a trade →</a></td></tr>`;
        return;
      }
      body.innerHTML = open
        .map((p) => {
          const i = instrument(p.symbol);
          const mark = getQuote(p.symbol)?.price || p.avgPrice;
          const u = unrealizedPnl(p, mark);
          return `<tr>
            <td><a class="mkt-name tight" href="${tradeHref(p.symbol)}"><span class="pill ${p.qty > 0 ? "buy" : "sell"}">${p.qty > 0 ? "L" : "S"}</span><span class="mkt-text"><b>${esc(p.symbol)}</b><em>${fmtQty(Math.abs(p.qty))} @ ${fmtPrice(i, p.avgPrice)}</em></span></a></td>
            <td class="num">${fmtPrice(i, mark)}</td>
            <td class="num ${dirClass(u)}"><b>${usdSigned(u)}</b><br><small>${pct(unrealizedPct(p, mark))}</small></td>
          </tr>`;
        })
        .join("");
      resub();
    }

    // ── movers ──
    function paintMovers() {
      const rows = [...allQuotes().values()]
        .filter((q) => q.changePct)
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, 8);
      const el = $("#movers", outlet);
      if (!rows.length) {
        el.innerHTML = `<p class="muted center pad">Loading market data…</p>`;
        return;
      }
      el.innerHTML = rows
        .map((q) => {
          const i = instrument(q.symbol);
          return `<a class="mover ${dirClass(q.changePct)}" href="${tradeHref(q.symbol)}">
            <span class="m-sym">${esc(q.symbol)}</span>
            <span class="m-price">${fmtPrice(i, q.price)}</span>
            <span class="m-chg">${pct(q.changePct)}</span>
          </a>`;
        })
        .join("");
    }

    function resub() {
      const syms = new Set([...watchlist, ...positions.filter((p) => p.qty).map((p) => p.symbol)]);
      if (unsubQuotes) unsubQuotes();
      unsubQuotes = subscribe([...syms], (q) => {
        const k = idKey(q.symbol);
        const i = instrument(q.symbol);
        const p = $("#wp-" + k, outlet);
        if (p) {
          const next = fmtPrice(i, q.price);
          if (p.textContent !== next) {
            p.textContent = next;
            flash(p, q.price - (q.prevPrice || q.price));
          }
        }
        const c = $("#wc-" + k, outlet);
        if (c) {
          c.textContent = pct(q.changePct);
          c.className = "num " + dirClass(q.changePct);
        }
        paintPositions.scheduled ||
          ((paintPositions.scheduled = true),
          requestAnimationFrame(() => {
            paintPositions.scheduled = false;
            paintPositions();
          }));
      });
    }

    const unsubWatch = subscribeWatchlist((w) => {
      watchlist = w;
      paintWatchlist();
    });
    const unsubPos = subscribePositions((p) => {
      positions = p;
      paintPositions();
    });
    const unsubTape = subscribeTape((rows) => {
      const el = $("#tape", outlet);
      if (!rows.length) {
        el.innerHTML = `<p class="muted center pad">${
          mode === "firestore" ? "No trades on the desk yet — be the first." : "Local demo mode — only your own fills appear here."
        }</p>`;
        return;
      }
      el.innerHTML = rows
        .map(
          (t) => `<div class="tape-row ${t.side}">
            <span class="who">${esc(t.name || "Trader")}</span>
            <span><b class="${t.side === "buy" ? "up" : "down"}">${t.side.toUpperCase()}</b> ${fmtQty(t.qty)} ${esc(t.symbol)}</span>
            <span class="num">${fmtPrice(instrument(t.symbol), t.price)}</span>
            <span class="muted">${timeAgo(t.createdAt)}</span>
          </div>`
        )
        .join("");
    }, 14);

    const unsubLb = subscribeLeaderboard((rows) => {
      const body = $("#lbBody", outlet);
      if (!rows.length) {
        body.innerHTML = `<tr><td class="empty">${
          mode === "firestore" ? "No ranked traders yet." : "Leaderboard needs Firestore."
        }</td></tr>`;
        return;
      }
      body.innerHTML = rows
        .map(
          (r, n) => `<tr>
            <td class="rank">${n + 1}</td>
            <td><b>${esc(r.name || "Trader")}</b><br><small class="muted">${r.trades || 0} trades</small></td>
            <td class="num">${usd(r.equity || 0)}</td>
            <td class="num ${dirClass(r.pnlPct)}">${pct(r.pnlPct || 0)}</td>
          </tr>`
        )
        .join("");
    });

    const unsubStatus = onStatus((s) => {
      const el = $("#feedStatus", outlet);
      const line = (name, st) => {
        const cls = st.ok ? "on" : st.transport === "locked" ? "warn" : "off";
        return `<div class="feed-line"><span class="dot ${cls}"></span><b>${name}</b>
          <span class="muted">${st.provider ? esc(st.provider) : "—"}${st.detail ? " · " + esc(st.detail) : ""}</span></div>`;
      };
      el.innerHTML =
        line("Crypto", s.crypto) +
        line("Stocks", s.stock) +
        line("Forex", s.fx) +
        `<p class="fineprint">Prices come straight from public exchange APIs in your browser. Nothing is simulated.</p>`;
      paintMovers();
    });

    const moversTimer = setInterval(paintMovers, 4000);
    warm("all").then(() => {
      paintMovers();
      paintWatchlist();
    });

    paintWatchlist();
    paintPositions();
    paintMovers();

    return {
      destroy() {
        clearInterval(moversTimer);
        if (unsubQuotes) unsubQuotes();
        unsubWatch();
        unsubPos();
        unsubTape();
        unsubLb();
        unsubStatus();
        unsubPortfolio();
      },
    };
  },
};
