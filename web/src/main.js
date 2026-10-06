import "./styles.css";
import { initBackend, onAuth, mode } from "./backend.js";
import { startFeed, onStatus } from "./market/feed.js";
import { startOrderMonitor, onPortfolio } from "./engine/monitor.js";
import { startRouter, register } from "./router.js";
import { dashboardPage } from "./pages/dashboard.js";
import { marketsPage } from "./pages/markets.js";
import { tradePage } from "./pages/trade.js";
import { portfolioPage } from "./pages/portfolio.js";
import { ordersPage } from "./pages/orders.js";
import { walletPage } from "./pages/wallet.js";
import { settingsPage } from "./pages/settings.js";
import { aboutPage } from "./pages/about.js";
import { openAuthModal, toggleProfileMenu } from "./auth-ui.js";
import { $, $$, usd, pct, dirClass } from "./ui.js";

const initials = (name) =>
  (name || "T")
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

async function boot() {
  // 1. backend (Firestore, or local fallback)
  const status = await initBackend();
  const chip = $("#modeChip");
  if (status.mode === "firestore") {
    chip.innerHTML = '<span class="dot on"></span> Firestore live';
    chip.classList.add("ok");
  } else {
    chip.innerHTML = '<span class="dot warn"></span> Local mode';
    chip.classList.add("warnchip");
    const banner = $("#setupBanner");
    banner.hidden = false;
    banner.innerHTML = `<strong>Local mode</strong> — Firestore isn't reachable (${status.modeReason}).
      The terminal works fully, but your book is stored in this browser only.
      Enable Firestore + Auth in the Firebase console: see <code>docs/SETUP-FIREBASE.md</code>.`;
  }

  // 2. market data feed (independent of auth — prices show to everyone)
  startFeed().catch((e) => console.error("feed failed to start", e));

  onStatus((s) => {
    const el = $("#modeChip");
    if (!el || mode !== "firestore") return;
    const live = s.crypto.transport === "ws";
    el.innerHTML = `<span class="dot ${s.crypto.ok ? "on" : "warn"}"></span> ${
      s.crypto.ok ? (live ? "Live stream · " + s.crypto.provider : "Live · " + s.crypto.provider) : "Feed degraded"
    }`;
  });

  // 3. auth + header equity
  onAuth((u) => {
    const area = $("#authArea");
    const equity = $("#equityChip");
    if (u) {
      area.innerHTML = `<button class="avatar" id="profileBtn" title="${u.name}">${initials(u.name)}</button>`;
      $("#profileBtn").addEventListener("click", toggleProfileMenu);
      startOrderMonitor();
    } else {
      area.innerHTML = `<button class="btn small primary" id="signinBtn">Open account</button>`;
      $("#signinBtn").addEventListener("click", () => openAuthModal("signup"));
      equity.innerHTML = `<span class="ec-label">Equity</span><b>—</b>`;
    }
  });

  onPortfolio((s) => {
    const el = $("#equityChip");
    if (!el) return;
    el.innerHTML = `<span class="ec-label">Equity</span><b>${usd(s.equity)}</b><span class="ec-pnl ${dirClass(
      s.totalPnl
    )}">${pct(s.totalPnlPct)}</span>`;
  });

  // 4. routes
  register("/", dashboardPage);
  register("/dashboard", dashboardPage);
  register("/markets", marketsPage);
  register("/trade/:symbol", tradePage);
  register("/portfolio", portfolioPage);
  register("/orders", ordersPage);
  register("/wallet", walletPage);
  register("/settings", settingsPage);
  register("/about", aboutPage);
  startRouter($("#outlet"));

  // 5. nav highlighting
  window.addEventListener("hb:route", (e) => {
    const { pattern } = e.detail;
    const active = pattern === "/" ? "/dashboard" : pattern.startsWith("/trade") ? "/trade" : pattern;
    $$("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === active));
  });
}

boot();
