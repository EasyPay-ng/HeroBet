// HeroBet — sign-in / sign-up modal and the profile menu.

import { signInEmail, signUpEmail, signInGuest, signOut, currentUser, mode } from "./backend.js";
import { $, openModal, toast, esc } from "./ui.js";

export function openAuthModal(initial = "signin") {
  const m = openModal(`
    <div class="auth">
      <div class="auth-head">
        <h3>HeroBet Markets</h3>
        <p class="muted">Open a paper-trading account. Real market prices, simulated capital.</p>
      </div>
      <div class="tabs" id="authTabs">
        <button class="tab ${initial === "signin" ? "on" : ""}" data-tab="signin">Sign in</button>
        <button class="tab ${initial === "signup" ? "on" : ""}" data-tab="signup">Create account</button>
      </div>

      <form id="authForm" class="stack">
        <label class="field" id="nameField" ${initial === "signin" ? "hidden" : ""}>
          <span>Display name</span>
          <input id="aName" type="text" autocomplete="nickname" placeholder="Ada" maxlength="24" />
        </label>
        <label class="field">
          <span>Email</span>
          <input id="aEmail" type="email" autocomplete="email" placeholder="you@email.com" required />
        </label>
        <label class="field">
          <span>Password</span>
          <input id="aPass" type="password" autocomplete="current-password" placeholder="At least 6 characters" required minlength="6" />
        </label>
        <p class="form-error" id="authErr" hidden></p>
        <button class="btn primary block" id="authSubmit" type="submit">${initial === "signin" ? "Sign in" : "Create account"}</button>
      </form>

      <div class="divider"><span>or</span></div>
      <button class="btn ghost block" id="guestBtn">Continue as guest</button>
      <p class="fineprint">
        Guest accounts work instantly and keep a full trading history. Paper capital only —
        HeroBet never takes deposits or holds client funds.
      </p>
    </div>
  `);

  const root = m.el;
  let tab = initial;

  const setTab = (t) => {
    tab = t;
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    $("#nameField", root).hidden = t === "signin";
    $("#authSubmit", root).textContent = t === "signin" ? "Sign in" : "Create account";
    $("#aPass", root).setAttribute("autocomplete", t === "signin" ? "current-password" : "new-password");
  };
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  const showErr = (msg) => {
    const el = $("#authErr", root);
    el.textContent = msg;
    el.hidden = !msg;
  };

  $("#authForm", root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#authSubmit", root);
    btn.disabled = true;
    btn.textContent = "Working…";
    showErr("");
    try {
      const email = $("#aEmail", root).value.trim();
      const pass = $("#aPass", root).value;
      if (tab === "signin") await signInEmail(email, pass);
      else await signUpEmail(email, pass, $("#aName", root).value.trim());
      m.close();
      toast("Welcome to the desk", "ok");
    } catch (err) {
      showErr(err.message);
      btn.disabled = false;
      btn.textContent = tab === "signin" ? "Sign in" : "Create account";
    }
  });

  $("#guestBtn", root).addEventListener("click", async () => {
    try {
      await signInGuest();
      m.close();
      toast("Guest desk opened — $100,000 paper capital", "ok");
    } catch (err) {
      showErr(err.message);
    }
  });

  return m;
}

let menu = null;

export function toggleProfileMenu() {
  if (menu) {
    menu.remove();
    menu = null;
    return;
  }
  const u = currentUser();
  if (!u) return openAuthModal();

  menu = document.createElement("div");
  menu.className = "profile-menu";
  menu.innerHTML = `
    <div class="pm-head">
      <strong>${esc(u.name)}</strong>
      <span class="muted">${esc(u.email || (u.anonymous ? "Guest account" : "Paper trader"))}</span>
      <span class="chip tiny">${mode === "firestore" ? "Firestore" : "Local only"}</span>
    </div>
    <a href="#/portfolio">Portfolio</a>
    <a href="#/orders">Orders &amp; fills</a>
    <a href="#/wallet">Cash &amp; ledger</a>
    <a href="#/settings">Settings</a>
    <button id="pmOut" class="danger-link">Sign out</button>
  `;
  document.body.appendChild(menu);

  const btn = document.getElementById("profileBtn");
  const r = btn.getBoundingClientRect();
  menu.style.top = r.bottom + 8 + "px";
  menu.style.right = Math.max(12, window.innerWidth - r.right) + "px";

  menu.querySelector("#pmOut").addEventListener("click", async () => {
    await signOut();
    toggleProfileMenu();
    location.hash = "#/markets";
  });
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => toggleProfileMenu()));

  setTimeout(() => {
    document.addEventListener("click", onAway, { once: true });
  }, 0);
}

function onAway(e) {
  if (!menu) return;
  if (menu.contains(e.target) || e.target.id === "profileBtn") {
    document.addEventListener("click", onAway, { once: true });
    return;
  }
  menu.remove();
  menu = null;
}
