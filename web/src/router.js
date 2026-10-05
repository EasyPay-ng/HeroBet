// HeroBet — minimal hash router
// Pages register { mount(outlet) -> {destroy?} }.
const routes = new Map();
let outlet = null;
let current = null;

export function register(path, page) {
  routes.set(path, page);
}

export function navigate(path) {
  location.hash = "#" + path;
}

export function currentPath() {
  return (location.hash || "#/").slice(1).split("?")[0] || "/";
}

function render() {
  const path = currentPath();
  const page = routes.get(path) || routes.get("/");
  if (current && current.destroy) {
    try {
      current.destroy();
    } catch (e) {
      console.error("page destroy failed", e);
    }
  }
  outlet.innerHTML = "";
  current = page.mount(outlet) || {};
  window.dispatchEvent(new CustomEvent("herobet:route", { detail: path }));
  window.scrollTo(0, 0);
}

export function startRouter(el) {
  outlet = el;
  window.addEventListener("hashchange", render);
  render();
}
