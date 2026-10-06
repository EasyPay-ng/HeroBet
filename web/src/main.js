import "./styles.css";
import { initBackend, onAuth, currentUser, subscribeWallet } from "./backend.js";
import { startRouter, register } from "./router.js";
import { lobbyPage } from "./pages/lobby.js";
import { predictionsPage } from "./pages/predictions.js";
import { crashPage } from "./pages/crash.js";
import { dicePage } from "./pages/dice.js";
import { promosPage } from "./pages/promos.js";
import { walletPage } from "./pages/wallet.js";
import { historyPage } from "./pages/history.js";
import { giftdropPage } from "./pages/giftdrop.js";
import { openAuthModal, toggleProfileMenu } from "./auth-ui.js";
import { $, $$, fmtN } from "./ui.js";

const initials = (name) =>
  (name || "H")
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

async function boot() {
  const status = await initBackend();

  // mode chip + setup banner
  const chip = $("#modeChip");
  if (status.mode === "firestore") {
    chip.innerHTML = '<span class="dot on"></span> Firestore live';
    chip.classList.add("ok");
  } else {
    chip.innerHTML = '<span class="dot warn"></span> Demo mode';
    chip.classList.add("warnchip");
    const banner = $("#setupBanner");
    banner.hidden = false;
    banner.innerHTML = `
      <strong>⚡ Demo mode</strong> — Firestore isn't reachable yet (${status.modeReason}). The whole platform works, but data stays in this browser.
      Connect Firestore in ~5 minutes: see <code>docs/SETUP-FIREBASE.md</code> in the repo.
    `;
  }

  // auth + wallet area
  let unWallet = null;
  onAuth((u) => {
    if (unWallet) {
      unWallet();
      unWallet = null;
    }
    const area = $("#authArea");
    const wallet = $("#walletChip");
    if (u) {
      area.innerHTML = `<button class="avatar" id="profileBtn" title="${u.name}">${initials(u.name)}</button>`;
      $("#profileBtn").addEventListener("click", toggleProfileMenu);
      unWallet = subscribeWallet((w) => {
        wallet.innerHTML = w ? `₦<b>${w.balance.toLocaleString("en-NG")}</b>` : "₦ —";
      });
    } else {
      area.innerHTML = `<button class="btn small" id="signinBtn">Sign in</button>`;
      $("#signinBtn").addEventListener("click", openAuthModal);
      wallet.innerHTML = "₦ —";
    }
  });

  // routes
  register("/", lobbyPage);
  register("/dashboard", lobbyPage);
  register("/predictions", predictionsPage);
  register("/crash", crashPage);
  register("/dice", dicePage);
  register("/promos", promosPage);
  register("/wallet", walletPage);
  register("/history", historyPage);
  register("/gift-drop", giftdropPage);
  startRouter($("#outlet"));

  // nav highlighting
  window.addEventListener("herobet:route", (e) => {
    const activeRoute = e.detail === "/" ? "/dashboard" : e.detail;
    $$("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === activeRoute));
  });

  $("#depositBtn").addEventListener("click", () => (location.hash = "#/wallet"));
}

boot();
