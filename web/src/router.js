// HeroBet — hash router with simple :params.
// Pages export { mount(outlet, params) -> { destroy?() } }.

const routes = []; // {parts, page}
let outlet = null;
let current = null;

export function register(pattern, page) {
  routes.push({ parts: pattern.split("/").filter(Boolean), pattern, page });
}

export function navigate(path) {
  location.hash = "#" + path;
}

/** Build a link to an instrument (FX symbols contain "/" so they get encoded). */
export const tradeHref = (symbol) => `#/trade/${encodeURIComponent(symbol)}`;

export function currentPath() {
  const raw = (location.hash || "#/").slice(1);
  return raw.split("?")[0] || "/";
}

function match(path) {
  const parts = path.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const rp = r.parts[i];
      if (rp.startsWith(":")) params[rp.slice(1)] = decodeURIComponent(parts[i]);
      else if (rp !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { page: r.page, params, pattern: r.pattern };
  }
  return null;
}

function render() {
  const path = currentPath();
  const hit = match(path) || match("/") || { page: routes[0].page, params: {}, pattern: "/" };

  if (current && current.destroy) {
    try {
      current.destroy();
    } catch (e) {
      console.error("page destroy failed", e);
    }
  }
  outlet.innerHTML = "";
  try {
    current = hit.page.mount(outlet, hit.params) || {};
  } catch (e) {
    console.error("page mount failed", e);
    outlet.innerHTML = `<div class="card error-card"><h3>Something broke on this screen</h3><pre>${String(
      e.message || e
    )}</pre></div>`;
    current = {};
  }
  window.dispatchEvent(new CustomEvent("hb:route", { detail: { path, pattern: hit.pattern, params: hit.params } }));
  window.scrollTo(0, 0);
}

export function startRouter(el) {
  outlet = el;
  window.addEventListener("hashchange", render);
  render();
}
