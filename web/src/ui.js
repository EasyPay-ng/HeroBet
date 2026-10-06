// HeroBet — DOM/format helpers shared by every page.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** USD money, e.g. $12,480.55 */
export function usd(n, dp = 2) {
  const v = Number(n);
  if (!isFinite(v)) return "$—";
  const sign = v < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
  );
}

/** Signed money with an explicit + for gains. */
export function usdSigned(n, dp = 2) {
  const v = Number(n) || 0;
  return (v > 0 ? "+" : "") + usd(v, dp);
}

export function pct(n, dp = 2) {
  const v = Number(n) || 0;
  return (v > 0 ? "+" : "") + v.toFixed(dp) + "%";
}

export function compact(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}

/** Quantity with sensible precision for the size involved. */
export function qty(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export const dirClass = (n) => (Number(n) > 0 ? "up" : Number(n) < 0 ? "down" : "flat");

export function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

export function clock(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toast(msg, kind = "info") {
  const root = document.getElementById("toasts");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 350);
  }, 3600);
}

export function openModal(html, { onClose, wide } = {}) {
  const root = document.getElementById("modalRoot");
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal-box${wide ? " wide" : ""}">${html}</div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => {
    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 220);
    onClose && onClose();
  };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", close));
  return { el: wrap, close };
}

export function confirmDialog(title, body, confirmLabel = "Confirm") {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(
      `<h3>${esc(title)}</h3><p class="muted">${body}</p>
       <div class="row end gap">
         <button class="btn ghost" data-close>Cancel</button>
         <button class="btn danger" id="cfm">${esc(confirmLabel)}</button>
       </div>`,
      {
        onClose: () => {
          if (!done) resolve(false);
        },
      }
    );
    $("#cfm", m.el).addEventListener("click", () => {
      done = true;
      resolve(true);
      m.close();
    });
  });
}

/** Inline SVG sparkline from an array of closes. */
export function sparkline(values, { width = 92, height = 28, up } = {}) {
  const pts = (values || []).filter((v) => isFinite(v));
  if (pts.length < 2) return `<svg class="spark" width="${width}" height="${height}"></svg>`;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const d = pts
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const rising = up ?? pts[pts.length - 1] >= pts[0];
  const stroke = rising ? "var(--up)" : "var(--down)";
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Briefly flash an element green/red when its value changes. */
export function flash(el, direction) {
  if (!el) return;
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth; // restart animation
  el.classList.add(direction > 0 ? "flash-up" : "flash-down");
}

export function skeleton(rows = 5) {
  return Array.from({ length: rows }, () => `<div class="skel-row"></div>`).join("");
}

/** Safe DOM id fragment from a symbol (BTC-USD, EUR/USD …). */
export const idKey = (s) => String(s).replace(/[^A-Za-z0-9]/g, "_");

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
