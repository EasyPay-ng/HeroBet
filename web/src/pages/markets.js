// HeroBet — markets browser. Live prices for every tradable instrument.

import { INSTRUMENTS, listByClass, searchInstruments, fmtPrice, ASSET_CLASS } from "../market/instruments.js";
import { subscribe, getQuote, warm, onStatus } from "../market/feed.js";
import { stockVendor } from "../market/keys.js";
import { subscribeWatchlist, toggleWatchlist, currentUser } from "../backend.js";
import { tradeHref } from "../router.js";
import { $, $$, esc, pct, compact, dirClass, idKey, debounce, toast, flash } from "../ui.js";

const TABS = [
  { id: "all", label: "All markets" },
  { id: "watchlist", label: "★ Watchlist" },
  { id: "crypto", label: "Crypto" },
  { id: "stock", label: "Stocks" },
  { id: "fx", label: "Forex" },
];

export const marketsPage = {
  mount(outlet) {
    let tab = sessionStorage.getItem("hb_mkt_tab") || "all";
    let term = "";
    let sort = { key: "changePct", dir: -1 };
    let watchlist = [];

    outlet.innerHTML = `
      <section class="page">
        <header class="page-head">
          <div>
            <h1>Markets</h1>
            <p class="muted" id="mktSub">Live prices from public exchange and central-bank data.</p>
          </div>
          <div class="row gap">
            <input id="mktSearch" class="input search" type="search" placeholder="Search BTC, Apple, NGN…" />
          </div>
        </header>

        <div class="tabs scroll" id="mktTabs">
          ${TABS.map((t) => `<button class="tab" data-tab="${t.id}">${t.label}</button>`).join("")}
        </div>

        <div id="stockNotice"></div>

        <div class="card table-card">
          <table class="data-table markets">
            <thead>
              <tr>
                <th class="star"></th>
                <th data-sort="symbol">Market</th>
                <th data-sort="price" class="num">Price</th>
                <th data-sort="changePct" class="num">24h</th>
                <th class="num range-col">24h range</th>
                <th data-sort="volume24h" class="num vol-col">24h volume</th>
                <th class="num"></th>
              </tr>
            </thead>
            <tbody id="mktBody"></tbody>
          </table>
        </div>
      </section>
    `;

    const body = $("#mktBody", outlet);
    let unsubQuotes = null;

    const visible = () => {
      let list =
        tab === "watchlist"
          ? watchlist.map((s) => INSTRUMENTS.find((i) => i.symbol === s)).filter(Boolean)
          : listByClass(tab === "all" ? "all" : tab);
      if (term) list = searchInstruments(term, tab === "watchlist" || tab === "all" ? "all" : tab).filter((i) => (tab === "watchlist" ? watchlist.includes(i.symbol) : true));
      const k = sort.key;
      return [...list].sort((a, b) => {
        if (k === "symbol") return a.symbol.localeCompare(b.symbol) * sort.dir;
        const qa = getQuote(a.symbol)?.[k] ?? -Infinity;
        const qb = getQuote(b.symbol)?.[k] ?? -Infinity;
        return (qa - qb) * sort.dir;
      });
    };

    function rangeBar(q) {
      if (!q || !q.high24h || !q.low24h || q.high24h <= q.low24h) return `<span class="muted">—</span>`;
      const p = Math.min(100, Math.max(0, ((q.price - q.low24h) / (q.high24h - q.low24h)) * 100));
      return `<div class="rangebar" title="low ${q.low24h} · high ${q.high24h}"><i style="left:${p.toFixed(1)}%"></i></div>`;
    }

    function rowHtml(inst) {
      const q = getQuote(inst.symbol);
      const k = idKey(inst.symbol);
      const starred = watchlist.includes(inst.symbol);
      const cls = ASSET_CLASS[inst.class];
      return `
        <tr data-symbol="${esc(inst.symbol)}">
          <td class="star"><button class="starbtn ${starred ? "on" : ""}" data-star="${esc(inst.symbol)}" title="Watchlist">★</button></td>
          <td>
            <a class="mkt-name" href="${tradeHref(inst.symbol)}">
              <span class="sym-badge ${inst.class}">${cls.icon}</span>
              <span class="mkt-text"><b>${esc(inst.symbol)}</b><em>${esc(inst.name)}</em></span>
            </a>
          </td>
          <td class="num price" id="p-${k}">${q ? fmtPrice(inst, q.price) : '<span class="dash">—</span>'}</td>
          <td class="num ${q ? dirClass(q.changePct) : ""}" id="c-${k}">${q ? pct(q.changePct) : "—"}</td>
          <td class="num range-col" id="r-${k}">${rangeBar(q)}</td>
          <td class="num vol-col" id="v-${k}">${q && q.volume24h ? "$" + compact(q.volume24h) : "—"}</td>
          <td class="num"><a class="btn tiny" href="${tradeHref(inst.symbol)}">Trade</a></td>
        </tr>`;
    }

    function paint() {
      const list = visible();
      if (!list.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty">${
          tab === "watchlist" ? "Your watchlist is empty — tap ★ on any market." : "No markets match that search."
        }</td></tr>`;
      } else {
        body.innerHTML = list.map(rowHtml).join("");
      }
      wireRows();
      resubscribe(list);
      renderStockNotice();
    }

    function wireRows() {
      $$("[data-star]", body).forEach((b) =>
        b.addEventListener("click", async (e) => {
          e.preventDefault();
          if (!currentUser()) return toast("Sign in to keep a watchlist", "warn");
          try {
            const now = await toggleWatchlist(b.dataset.star);
            b.classList.toggle("on", now);
          } catch {
            toast("Could not update watchlist", "warn");
          }
        })
      );
    }

    function update(q) {
      const inst = INSTRUMENTS.find((i) => i.symbol === q.symbol);
      if (!inst) return;
      const k = idKey(q.symbol);
      const pEl = $("#p-" + k, body);
      if (pEl) {
        const next = fmtPrice(inst, q.price);
        if (pEl.textContent !== next) {
          pEl.textContent = next;
          flash(pEl, q.price - (q.prevPrice || q.price));
        }
      }
      const cEl = $("#c-" + k, body);
      if (cEl) {
        cEl.textContent = pct(q.changePct);
        cEl.className = "num " + dirClass(q.changePct);
      }
      const rEl = $("#r-" + k, body);
      if (rEl) rEl.innerHTML = rangeBar(q);
      const vEl = $("#v-" + k, body);
      if (vEl) vEl.textContent = q.volume24h ? "$" + compact(q.volume24h) : "—";
    }

    function resubscribe(list) {
      if (unsubQuotes) unsubQuotes();
      unsubQuotes = subscribe(list.map((i) => i.symbol), update);
    }

    function renderStockNotice() {
      const el = $("#stockNotice", outlet);
      const needs = (tab === "stock" || tab === "all") && !stockVendor();
      el.innerHTML = needs
        ? `<div class="notice">
             <strong>Stock prices need a free data key.</strong>
             US equities have no public keyless API, so HeroBet will not show you a made-up number.
             Paste a free Twelve Data or Finnhub key in <a href="#/settings">Settings → Market data</a> and the
             ${listByClass("stock").length} stock markets go live instantly.
           </div>`
        : "";
    }

    // tabs / search / sort
    $$("[data-tab]", outlet).forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === tab);
      b.addEventListener("click", () => {
        tab = b.dataset.tab;
        sessionStorage.setItem("hb_mkt_tab", tab);
        $$("[data-tab]", outlet).forEach((x) => x.classList.toggle("on", x === b));
        paint();
      });
    });

    $("#mktSearch", outlet).addEventListener(
      "input",
      debounce((e) => {
        term = e.target.value;
        paint();
      }, 180)
    );

    $$("[data-sort]", outlet).forEach((th) =>
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        sort = { key, dir: sort.key === key ? -sort.dir : key === "symbol" ? 1 : -1 };
        $$("[data-sort]", outlet).forEach((x) => x.classList.remove("asc", "desc"));
        th.classList.add(sort.dir > 0 ? "asc" : "desc");
        paint();
      })
    );

    const unsubWatch = subscribeWatchlist((w) => {
      watchlist = w;
      if (tab === "watchlist") paint();
      else $$("[data-star]", body).forEach((b) => b.classList.toggle("on", w.includes(b.dataset.star)));
    });

    const unsubStatus = onStatus((s) => {
      const sub = $("#mktSub", outlet);
      if (!sub) return;
      const bits = [];
      if (s.crypto.ok) bits.push(`crypto via ${s.crypto.provider}${s.crypto.transport === "ws" ? " (live stream)" : ""}`);
      else bits.push("crypto unavailable");
      if (s.stock.ok) bits.push(`stocks via ${s.stock.provider}`);
      if (s.fx.ok) bits.push(`FX via ${s.fx.provider}`);
      sub.textContent = "Real market data — " + bits.join(" · ");
    });

    paint();
    warm("all").then(paint).catch(() => {});

    return {
      destroy() {
        if (unsubQuotes) unsubQuotes();
        unsubWatch();
        unsubStatus();
      },
    };
  },
};
