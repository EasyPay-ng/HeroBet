// HeroBet — auth modal + profile menu
import { $, esc, openModal, toast } from "./ui.js";
import { currentUser, signInGuest, signInEmail, signUpEmail, signOut } from "./backend.js";

export function openAuthModal() {
  const m = openModal(
    `
    <div class="auth-modal">
      <div class="auth-hero">
        <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
          <path d="M24 3 6 9v14c0 11 7.6 19.4 18 22 10.4-2.6 18-11 18-22V9L24 3z" fill="url(#gGold)"/>
          <path d="M26.8 10 16 26h6.6L21 38l11-16h-6.6l1.4-12z" fill="#0A1224"/>
        </svg>
        <h2>JOIN THE HEROES</h2>
        <p>One account for Crash, Dice, Wallet & Gift Drop.</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="in">Sign in</button>
        <button class="auth-tab" data-tab="up">Create account</button>
      </div>
      <form id="authForm" class="auth-form">
        <label class="field" data-only="up" hidden>
          <span>Hero name</span>
          <input id="authName" type="text" maxlength="24" placeholder="e.g. LagosLightning" autocomplete="nickname" />
        </label>
        <label class="field">
          <span>Email</span>
          <input id="authEmail" type="email" required placeholder="you@email.com" autocomplete="email" />
        </label>
        <label class="field">
          <span>Password</span>
          <input id="authPass" type="password" required minlength="6" placeholder="min. 6 characters" autocomplete="current-password" />
        </label>
        <div id="authErr" class="auth-err" hidden></div>
        <button type="submit" class="btn wide" id="authSubmit">Sign in</button>
      </form>
      <div class="auth-or"><span>or</span></div>
      <button id="authGuest" class="btn ghost wide">⚡ Continue as guest</button>
      <p class="auth-fine">New accounts get a ₦10,000 demo credit. 18+ · Play responsibly.</p>
    </div>
    `
  );

  let tab = "in";
  $$(".auth-tab", m.el).forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      $$(".auth-tab", m.el).forEach((x) => x.classList.toggle("active", x === b));
      $("[data-only=up]", m.el).hidden = tab !== "up";
      $("#authSubmit", m.el).textContent = tab === "up" ? "Create account" : "Sign in";
    })
  );

  $("#authForm", m.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail", m.el).value.trim();
    const pass = $("#authPass", m.el).value;
    const name = $("#authName", m.el)?.value.trim();
    const errEl = $("#authErr", m.el);
    errEl.hidden = true;
    $("#authSubmit", m.el).disabled = true;
    try {
      if (tab === "up") await signUpEmail(email, pass, name);
      else await signInEmail(email, pass);
      m.close();
      toast("Welcome back, hero! ⚡", "ok");
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      $("#authSubmit", m.el).disabled = false;
    }
  });

  $("#authGuest", m.el).addEventListener("click", async () => {
    try {
      await signInGuest();
      m.close();
      toast("You're in — ₦10,000 demo credit added ⚡", "ok");
    } catch (err) {
      toast(err.message, "err");
    }
  });
}

export function toggleProfileMenu() {
  const existing = document.getElementById("profileMenu");
  if (existing) {
    existing.remove();
    return;
  }
  const u = currentUser();
  const menu = document.createElement("div");
  menu.id = "profileMenu";
  menu.className = "profile-menu";
  menu.innerHTML = `
    <div class="pm-name">${esc(u ? u.name : "Guest")}</div>
    <div class="pm-sub">${u?.email ? esc(u.email) : "Guest hero · " + (u?.uid || "").slice(0, 10)}</div>
    <a href="#/wallet">Wallet & deposits</a>
    <a href="#/history">My bets</a>
    ${u?.email ? "" : '<div class="pm-sub">Guest account — progress lives on this project</div>'}
    <button id="pmSignOut">Sign out</button>
  `;
  document.body.appendChild(menu);
  const rect = document.getElementById("profileBtn").getBoundingClientRect();
  menu.style.top = rect.bottom + 10 + "px";
  menu.style.right = Math.max(10, window.innerWidth - rect.right) + "px";
  menu.addEventListener("click", (e) => {
    if (e.target.id === "pmSignOut") {
      signOut();
      menu.remove();
      toast("Signed out. See you, hero.");
    }
  });
  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target) && e.target.id !== "profileBtn") {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close);
  }, 10);
}
