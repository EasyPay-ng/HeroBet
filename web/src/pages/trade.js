// HeroBet — the trading terminal: real chart, real book, real tape, paper fills.

import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import { instrument, fmtPrice, roundQty, searchInstruments, ASSET_CLASS } from "../market/instruments.js";
import { subscribe, getQuote, candles, orderBook, recentTrades, intervalSeconds, onStatus } from "../market/feed.js";
import { stockVendor } from "../market/keys.js";
import {
  placeOrder,
  cancelOrder,
  subscribeOrders,
  subscribePositions,
  subscribeAccount,
  toggleWatchlist,
  subscribeWatchlist,
  currentUser,
} from "../backend.js";
import { executionPrice, feeFor, maxQty, unrealizedPnl, unrealizedPct } from "../engine/paper.js";
import { openAuthModal } from "../auth-ui.js";
import { tradeHref } from "../router.js";
import { $, $$, esc, usd, usdSigned, pct, compact, dirClass, qty as fmtQty, clock, toast, flash, debounce } from "../ui.js";

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const tradePage = {
  mount(outlet, params) {
    const symbol = params.symbol || "BTC-USD";
    const inst = instrument(symbol);
    if (!inst) {
      outlet.innerHTML = `<div class="card error-card"><h3>Unknown market</h3><p class="muted">${esc(symbol)} isn't in the instrument list.</p><a class="btn" href="#/markets">Back to markets</a></div>`;
      return {};
    }

    let interval = localStorage.getItem("hb_interval") || "1h";
    if (!INTERVALS.includes(interval)) interval = "1h";
    let side = "buy";
    let type = "market";
    let bars = [];
    let account = null;
    let position = null;
    let orders = [];
    let watchlist = [];
    let chart = null;
    let candleSeries = null;
    let volSeries = null;
    let priceLines = [];
    let destroyed = false;

    outlet.innerHTML = `
      <section class="terminal">
        <header class="tkr-head card">
          <div class="tkr-left">
            <button class="starbtn big" id="starBtn" title="Watchlist">★</button>
            <div class="tkr-id">
              <div class="row gap center">
                <span class="sym-badge ${inst.class}">${ASSET_CLASS[inst.class].icon}</span>
                <h1 id="tkrSym">${esc(inst.symbol)}</h1>
                <button class="btn tiny ghost" id="switchBtn">Switch ▾</button>
              </div>
              <p class="muted">${esc(inst.name)} · ${ASSET_CLASS[inst.class].label}</p>
            </div>
          </div>
          <div class="tkr-price">
            <div class="big-price" id="tkrPrice">—</div>
            <div class="sub" id="tkrChange">waiting for data…</div>
          </div>
          <dl class="tkr-stats">
            <div><dt>24h high</dt><dd id="stHigh">—</dd></div>
            <div><dt>24h low</dt><dd id="stLow">—</dd></div>
            <div><dt>24h volume</dt><dd id="stVol">—</dd></div>
            <div><dt>Source</dt><dd id="stSrc">—</dd></div>
          </dl>
        </header>

        <div class="terminal-grid">
          <div class="stack">
            <div class="card chart-card">
              <div class="chart-top">
                <div class="tabs small" id="ivTabs">
                  ${INTERVALS.map((i) => `<button class="tab ${i === interval ? "on" : ""}" data-iv="${i}">${i}</button>`).join("")}
                </div>
                <div class="chart-legend" id="chartLegend"></div>
              </div>
              <div class="chart-host" id="chartHost"></div>
              <div class="chart-msg" id="chartMsg" hidden></div>
            </div>

            <div class="card">
              <div class="card-head"><h3>Your position</h3></div>
              <div id="posPanel" class="pad"></div>
            </div>

            <div class="card">
              <div class="card-head"><h3>Open orders</h3><span class="muted" id="ooCount"></span></div>
              <div id="openOrders"></div>
            </div>
          </div>

          <div class="stack">
            <div class="card ticket">
              <div class="seg" id="sideSeg">
                <button class="seg-btn buy on" data-side="buy">Buy</button>
                <button class="seg-btn sell" data-side="sell">Sell / Short</button>
              </div>
              <div class="tabs small full" id="typeTabs">
                <button class="tab on" data-type="market">Market</button>
                <button class="tab" data-type="limit">Limit</button>
                <button class="tab" data-type="stop">Stop</button>
              </div>

              <label class="field" id="limitField" hidden>
                <span>Limit price</span>
                <input id="limitPrice" class="input" type="number" step="any" inputmode="decimal" />
              </label>
              <label class="field" id="stopField" hidden>
                <span>Stop price</span>
                <input id="stopPrice" class="input" type="number" step="any" inputmode="decimal" />
              </label>

              <label class="field">
                <span>Quantity <em id="qtyUnit">${esc(inst.base)}</em></span>
                <input id="qty" class="input" type="number" step="any" inputmode="decimal" placeholder="0.00" />
              </label>
              <div class="pctrow" id="pctRow">
                ${[25, 50, 75, 100].map((p) => `<button class="btn tiny ghost" data-pct="${p}">${p}%</button>`).join("")}
              </div>

              <dl class="ticket-sum">
                <div><dt>Est. price</dt><dd id="sumPrice">—</dd></div>
                <div><dt>Order value</dt><dd id="sumValue">—</dd></div>
                <div><dt>Fee (${(inst.class === "crypto" ? 0.1 : inst.class === "fx" ? 0.01 : 0).toFixed(2)}%)</dt><dd id="sumFee">—</dd></div>
                <div class="hr"></div>
                <div><dt>Buying power</dt><dd id="sumAvail">—</dd></div>
              </dl>

              <p class="form-error" id="ticketErr" hidden></p>
              <button class="btn primary block big" id="submitBtn">Buy ${esc(inst.base)}</button>
              <p class="fineprint">Paper order — filled against the live ${esc(inst.class === "crypto" ? "exchange" : "market")} price. No real funds move.</p>
            </div>

            <div class="card" id="bookCard">
              <div class="card-head"><h3>Order book</h3><span class="muted" id="bookSpread"></span></div>
              <div id="book" class="book"></div>
            </div>

            <div class="card" id="tapeCard">
              <div class="card-head"><h3>Market trades</h3></div>
              <div id="tape" class="tape"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    // ───────────────── chart ─────────────────
    const host = $("#chartHost", outlet);

    function buildChart() {
      chart = createChart(host, {
        layout: {
          background: { color: "transparent" },
          textColor: "#8e97ad",
          fontFamily: "'Sora', system-ui, sans-serif",
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,.035)" },
          horzLines: { color: "rgba(255,255,255,.035)" },
        },
        rightPriceScale: { borderColor: "rgba(255,255,255,.08)", scaleMargins: { top: 0.08, bottom: 0.28 } },
        timeScale: { borderColor: "rgba(255,255,255,.08)", timeVisible: interval !== "1d", secondsVisible: false },
        crosshair: {
          mode: 1,
          vertLine: { color: "rgba(255,197,61,.45)", labelBackgroundColor: "#c99700" },
          horzLine: { color: "rgba(255,197,61,.45)", labelBackgroundColor: "#c99700" },
        },
        handleScale: { axisPressedMouseMove: { price: false } },
        autoSize: true,
      });

      candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#16c784",
        downColor: "#ea3943",
        borderUpColor: "#16c784",
        borderDownColor: "#ea3943",
        wickUpColor: "#16c784",
        wickDownColor: "#ea3943",
        priceFormat: { type: "price", precision: inst.pricePrecision, minMove: Math.pow(10, -inst.pricePrecision) },
      });

      volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: "rgba(110,120,150,.35)",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

      chart.subscribeCrosshairMove((p) => {
        const legend = $("#chartLegend", outlet);
        if (!legend) return;
        const bar = p?.seriesData?.get(candleSeries);
        if (!bar) {
          legend.innerHTML = "";
          return;
        }
        const up = bar.close >= bar.open;
        legend.innerHTML = `<span>O <b>${fmtPrice(inst, bar.open)}</b></span><span>H <b>${fmtPrice(inst, bar.high)}</b></span><span>L <b>${fmtPrice(inst, bar.low)}</b></span><span class="${up ? "up" : "down"}">C <b>${fmtPrice(inst, bar.close)}</b></span>`;
      });
    }

    function chartMsg(msg) {
      const el = $("#chartMsg", outlet);
      if (!el) return;
      el.hidden = !msg;
      el.innerHTML = msg || "";
    }

    async function loadCandles() {
      chartMsg(`<span class="spinner"></span> loading ${interval} candles…`);
      try {
        const rows = await candles(inst.symbol, interval, 400);
        if (destroyed) return;
        bars = rows.filter((r) => r.close > 0);
        if (!bars.length) throw new Error("no data returned");
        candleSeries.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        volSeries.setData(
          bars.map((b) => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? "rgba(22,199,132,.3)" : "rgba(234,57,67,.3)" }))
        );
        chart.timeScale().fitContent();
        chartMsg("");
        drawLines();
      } catch (e) {
        const needsKey = inst.class === "stock" && !stockVendor();
        chartMsg(
          needsKey
            ? `<strong>Chart locked.</strong> US equity history needs a free data key — add one in <a href="#/settings">Settings → Market data</a>.`
            : `<strong>No chart data.</strong> ${esc(e.message || "The data source didn't answer.")} <button class="btn tiny" id="retryChart">Retry</button>`
        );
        const r = $("#retryChart", outlet);
        if (r) r.addEventListener("click", loadCandles);
      }
    }

    /** Entry + resting-order markers drawn straight on the price scale. */
    function drawLines() {
      if (!candleSeries) return;
      priceLines.forEach((l) => {
        try {
          candleSeries.removePriceLine(l);
        } catch {
          /* already gone */
        }
      });
      priceLines = [];
      if (position?.qty) {
        priceLines.push(
          candleSeries.createPriceLine({
            price: position.avgPrice,
            color: position.qty > 0 ? "#16c784" : "#ea3943",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `${position.qty > 0 ? "LONG" : "SHORT"} ${fmtQty(Math.abs(position.qty))}`,
          })
        );
      }
      for (const o of orders.filter((x) => x.status === "open" && x.symbol === inst.symbol)) {
        priceLines.push(
          candleSeries.createPriceLine({
            price: o.type === "limit" ? o.limitPrice : o.stopPrice,
            color: o.side === "buy" ? "rgba(22,199,132,.75)" : "rgba(234,57,67,.75)",
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: `${o.type} ${o.side}`,
          })
        );
      }
    }

    function pushTick(q) {
      if (!candleSeries || !bars.length) return;
      const sec = intervalSeconds(interval);
      const t = Math.floor((q.ts || Date.now()) / 1000 / sec) * sec;
      const last = bars[bars.length - 1];
      if (t > last.time) {
        const bar = { time: t, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 };
        bars.push(bar);
        candleSeries.update(bar);
      } else if (t === last.time) {
        last.close = q.price;
        last.high = Math.max(last.high, q.price);
        last.low = Math.min(last.low, q.price);
        candleSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
      }
    }

    // ───────────────── header ─────────────────
    function paintHeader(q) {
      const p = $("#tkrPrice", outlet);
      if (!q) return;
      const next = fmtPrice(inst, q.price);
      if (p.textContent !== next) {
        p.textContent = next;
        flash(p, q.price - (q.prevPrice || q.price));
      }
      const c = $("#tkrChange", outlet);
      const ref = 1 + q.changePct / 100;
      const abs = ref > 0 ? q.price - q.price / ref : 0;
      c.className = "sub " + dirClass(q.changePct);
      c.textContent = `${pct(q.changePct)} (${usdSigned(abs)}) · 24h`;
      $("#stHigh", outlet).textContent = q.high24h ? fmtPrice(inst, q.high24h) : "—";
      $("#stLow", outlet).textContent = q.low24h ? fmtPrice(inst, q.low24h) : "—";
      $("#stVol", outlet).textContent = q.volume24h ? "$" + compact(q.volume24h) : "—";
      $("#stSrc", outlet).innerHTML = `${esc(q.source)}${q.daily ? ' <span class="chip tiny">daily</span>' : ""}`;
      document.title = `${next} ${inst.symbol} · HeroBet`;
      refreshTicket();
    }

    // ───────────────── ticket ─────────────────
    const qtyInput = $("#qty", outlet);

    function currentPrice() {
      const q = getQuote(inst.symbol);
      if (type === "limit") return Number($("#limitPrice", outlet).value) || q?.price || 0;
      if (type === "stop") return Number($("#stopPrice", outlet).value) || q?.price || 0;
      return q ? executionPrice(inst, side, q) : 0;
    }

    function refreshTicket() {
      const price = currentPrice();
      const q = Number(qtyInput.value) || 0;
      const notional = q * price;
      const fee = feeFor(inst, notional);
      const avail = (account?.cash || 0) - (account?.reserved || 0);
      $("#sumPrice", outlet).textContent = price ? fmtPrice(inst, price) : "—";
      $("#sumValue", outlet).textContent = notional ? usd(notional) : "—";
      $("#sumFee", outlet).textContent = notional ? usd(fee) : "—";
      $("#sumAvail", outlet).textContent = account ? usd(avail) : "—";
      const btn = $("#submitBtn", outlet);
      btn.className = "btn block big " + (side === "buy" ? "buy" : "sell");
      const verb = side === "buy" ? "Buy" : position?.qty > 0 ? "Sell" : "Short";
      btn.textContent = `${verb} ${q ? fmtQty(q) + " " : ""}${inst.base}`;
    }

    function setSide(s) {
      side = s;
      $$("[data-side]", outlet).forEach((b) => b.classList.toggle("on", b.dataset.side === s));
      refreshTicket();
    }

    function setType(t) {
      type = t;
      $$("[data-type]", outlet).forEach((b) => b.classList.toggle("on", b.dataset.type === t));
      $("#limitField", outlet).hidden = t !== "limit";
      $("#stopField", outlet).hidden = t !== "stop";
      const q = getQuote(inst.symbol);
      if (t === "limit" && q && !$("#limitPrice", outlet).value) $("#limitPrice", outlet).value = q.price.toFixed(inst.pricePrecision);
      if (t === "stop" && q && !$("#stopPrice", outlet).value) $("#stopPrice", outlet).value = q.price.toFixed(inst.pricePrecision);
      refreshTicket();
    }

    $$("[data-side]", outlet).forEach((b) => b.addEventListener("click", () => setSide(b.dataset.side)));
    $$("[data-type]", outlet).forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));
    qtyInput.addEventListener("input", refreshTicket);
    $$("[data-pct]", outlet).forEach((b) =>
      b.addEventListener("click", () => {
        const price = currentPrice();
        if (!price || !account) return;
        const max = maxQty(
          { cash: account.cash, reserved: account.reserved || 0 },
          position,
          inst,
          side,
          price
        );
        const v = roundQty(inst, (max * Number(b.dataset.pct)) / 100);
        qtyInput.value = v > 0 ? v : "";
        refreshTicket();
      })
    );
    $("#limitPrice", outlet).addEventListener("input", refreshTicket);
    $("#stopPrice", outlet).addEventListener("input", refreshTicket);

    $("#submitBtn", outlet).addEventListener("click", async () => {
      const err = $("#ticketErr", outlet);
      err.hidden = true;
      if (!currentUser()) return openAuthModal();
      const q = roundQty(inst, Number(qtyInput.value));
      if (!(q > 0)) {
        err.textContent = `Enter a quantity (min ${inst.minQty} ${inst.base})`;
        err.hidden = false;
        return;
      }
      const btn = $("#submitBtn", outlet);
      btn.disabled = true;
      try {
        const live = getQuote(inst.symbol);
        const res = await placeOrder(
          {
            symbol: inst.symbol,
            side,
            type,
            qty: q,
            limitPrice: Number($("#limitPrice", outlet).value),
            stopPrice: Number($("#stopPrice", outlet).value),
          },
          live ? { ...live, execPrice: executionPrice(inst, side, live) } : null
        );
        qtyInput.value = "";
        refreshTicket();
        toast(
          res.status === "filled"
            ? `Filled — ${side} ${fmtQty(q)} ${inst.base}`
            : `${type} order resting — triggers at ${fmtPrice(inst, type === "limit" ? Number($("#limitPrice", outlet).value) : Number($("#stopPrice", outlet).value))}`,
          "ok"
        );
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });

    // ───────────────── position + orders ─────────────────
    function paintPosition() {
      const el = $("#posPanel", outlet);
      const mark = getQuote(inst.symbol)?.price || 0;
      if (!position || !position.qty) {
        el.innerHTML = `<p class="muted center">No open position in ${esc(inst.symbol)}.</p>`;
        return;
      }
      const u = unrealizedPnl(position, mark);
      const up = unrealizedPct(position, mark);
      el.innerHTML = `
        <div class="pos-grid">
          <div><span>Side</span><b class="${position.qty > 0 ? "up" : "down"}">${position.qty > 0 ? "LONG" : "SHORT"}</b></div>
          <div><span>Size</span><b>${fmtQty(Math.abs(position.qty))} ${esc(inst.base)}</b></div>
          <div><span>Avg entry</span><b>${fmtPrice(inst, position.avgPrice)}</b></div>
          <div><span>Mark</span><b>${mark ? fmtPrice(inst, mark) : "—"}</b></div>
          <div><span>Unrealised</span><b class="${dirClass(u)}">${usdSigned(u)} <small>${pct(up)}</small></b></div>
          <div><span>Realised</span><b class="${dirClass(position.realized)}">${usdSigned(position.realized || 0)}</b></div>
        </div>
        <div class="row gap mt">
          <button class="btn small" id="closeHalf">Close 50%</button>
          <button class="btn small danger" id="closeAll">Close position</button>
        </div>`;
      const close = async (fraction) => {
        const q = roundQty(inst, Math.abs(position.qty) * fraction);
        if (!(q > 0)) return;
        const live = getQuote(inst.symbol);
        const closeSide = position.qty > 0 ? "sell" : "buy";
        try {
          await placeOrder(
            { symbol: inst.symbol, side: closeSide, type: "market", qty: q },
            live ? { ...live, execPrice: executionPrice(inst, closeSide, live) } : null
          );
          toast("Position closed", "ok");
        } catch (e) {
          toast(e.message, "warn");
        }
      };
      $("#closeHalf", el).addEventListener("click", () => close(0.5));
      $("#closeAll", el).addEventListener("click", () => close(1));
    }

    function paintOrders() {
      const mine = orders.filter((o) => o.status === "open" && o.symbol === inst.symbol);
      $("#ooCount", outlet).textContent = mine.length ? `${mine.length} resting` : "";
      const el = $("#openOrders", outlet);
      if (!mine.length) {
        el.innerHTML = `<p class="muted center pad">No resting orders here.</p>`;
        return;
      }
      el.innerHTML = `<table class="data-table compact"><tbody>${mine
        .map(
          (o) => `<tr>
            <td><span class="pill ${o.side}">${o.side}</span> <span class="muted">${o.type}</span></td>
            <td class="num">${fmtQty(o.qty)}</td>
            <td class="num">${fmtPrice(inst, o.type === "limit" ? o.limitPrice : o.stopPrice)}</td>
            <td class="num"><button class="btn tiny ghost" data-cancel="${o.id}">Cancel</button></td>
          </tr>`
        )
        .join("")}</tbody></table>`;
      $$("[data-cancel]", el).forEach((b) =>
        b.addEventListener("click", async () => {
          await cancelOrder(b.dataset.cancel);
          toast("Order cancelled");
        })
      );
    }

    // ───────────────── book + tape ─────────────────
    let bookTimer = null;
    async function refreshBook() {
      const el = $("#book", outlet);
      const card = $("#bookCard", outlet);
      if (inst.class !== "crypto") {
        card.hidden = true;
        $("#tapeCard", outlet).hidden = true;
        return;
      }
      const b = await orderBook(inst.symbol);
      if (destroyed || !b || !el) return;
      const asks = b.asks.slice(0, 8).reverse();
      const bids = b.bids.slice(0, 8);
      const maxQ = Math.max(...[...asks, ...bids].map((r) => r[1]), 0.0001);
      const row = (r, kind) =>
        `<div class="book-row ${kind}"><i style="width:${Math.min(100, (r[1] / maxQ) * 100).toFixed(1)}%"></i><span class="bp">${fmtPrice(inst, r[0])}</span><span class="bq">${fmtQty(r[1])}</span></div>`;
      el.innerHTML = asks.map((r) => row(r, "ask")).join("") + `<div class="book-mid">${fmtPrice(inst, getQuote(inst.symbol)?.price || 0)}</div>` + bids.map((r) => row(r, "bid")).join("");
      const spread = b.asks[0] && b.bids[0] ? b.asks[0][0] - b.bids[0][0] : 0;
      $("#bookSpread", outlet).textContent = spread ? `spread ${fmtPrice(inst, spread)}` : "";
    }

    async function refreshTape() {
      if (inst.class !== "crypto") return;
      const rows = await recentTrades(inst.symbol);
      const el = $("#tape", outlet);
      if (destroyed || !el || !rows.length) return;
      el.innerHTML = rows
        .slice(0, 14)
        .map(
          (t) =>
            `<div class="tape-row ${t.side}"><span>${fmtPrice(inst, t.price)}</span><span class="num">${fmtQty(t.qty)}</span><span class="muted">${clock(t.ts)}</span></div>`
        )
        .join("");
    }

    // ───────────────── switcher ─────────────────
    $("#switchBtn", outlet).addEventListener("click", () => {
      const box = document.createElement("div");
      box.className = "switcher";
      box.innerHTML = `<input class="input" id="swIn" placeholder="Jump to market…" autofocus /><div id="swList"></div>`;
      outlet.querySelector(".tkr-head").appendChild(box);
      const render = (term) => {
        const list = searchInstruments(term).slice(0, 10);
        $("#swList", box).innerHTML = list
          .map(
            (i) =>
              `<a href="${tradeHref(i.symbol)}" data-sw><span class="sym-badge ${i.class}">${ASSET_CLASS[i.class].icon}</span> <b>${esc(i.symbol)}</b> <em class="muted">${esc(i.name)}</em></a>`
          )
          .join("");
      };
      render("");
      $("#swIn", box).addEventListener("input", debounce((e) => render(e.target.value), 120));
      $("#swIn", box).focus();
      setTimeout(() => {
        const away = (ev) => {
          if (!box.contains(ev.target)) {
            box.remove();
            document.removeEventListener("click", away);
          }
        };
        document.addEventListener("click", away);
      }, 0);
    });

    $("#starBtn", outlet).addEventListener("click", async () => {
      if (!currentUser()) return toast("Sign in to keep a watchlist", "warn");
      const on = await toggleWatchlist(inst.symbol);
      $("#starBtn", outlet).classList.toggle("on", on);
    });

    $$("[data-iv]", outlet).forEach((b) =>
      b.addEventListener("click", () => {
        interval = b.dataset.iv;
        localStorage.setItem("hb_interval", interval);
        $$("[data-iv]", outlet).forEach((x) => x.classList.toggle("on", x === b));
        chart.applyOptions({ timeScale: { timeVisible: interval !== "1d" } });
        loadCandles();
      })
    );

    // ───────────────── wiring ─────────────────
    buildChart();
    loadCandles();

    const unsubQuote = subscribe([inst.symbol], (q) => {
      paintHeader(q);
      pushTick(q);
      paintPosition();
    });
    const unsubAcct = subscribeAccount((a) => {
      account = a;
      refreshTicket();
    });
    const unsubPos = subscribePositions((list) => {
      position = list.find((p) => p.symbol === inst.symbol) || null;
      paintPosition();
      drawLines();
      refreshTicket();
    });
    const unsubOrders = subscribeOrders((list) => {
      orders = list;
      paintOrders();
      drawLines();
    });
    const unsubWatch = subscribeWatchlist((w) => {
      watchlist = w;
      $("#starBtn", outlet).classList.toggle("on", w.includes(inst.symbol));
    });
    const unsubStatus = onStatus(() => {});

    refreshBook();
    refreshTape();
    bookTimer = setInterval(() => {
      if (document.hidden) return;
      refreshBook();
      refreshTape();
    }, 5000);

    paintPosition();
    paintOrders();
    refreshTicket();
    const existing = getQuote(inst.symbol);
    if (existing) paintHeader(existing);

    return {
      destroy() {
        destroyed = true;
        clearInterval(bookTimer);
        unsubQuote();
        unsubAcct();
        unsubPos();
        unsubOrders();
        unsubWatch();
        unsubStatus();
        try {
          chart?.remove();
        } catch {
          /* already disposed */
        }
        document.title = "HeroBet — Trading Terminal";
      },
    };
  },
};
