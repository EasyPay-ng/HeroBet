// HeroBet — tiny DOM/UI helpers shared by all pages
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const fmtN = (n) => "₦" + Math.round(n).toLocaleString("en-NG");
export const fmtMult = (m) => Number(m).toFixed(2) + "x";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

export function toast(msg, kind = "info") {
  const root = document.getElementById("toasts");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

export function openModal(html, { onClose } = {}) {
  const root = document.getElementById("modalRoot");
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal-box">${html}</div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => {
    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 250);
    onClose && onClose();
  };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", close));
  return { el: wrap, close };
}
