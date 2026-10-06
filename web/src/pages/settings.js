// HeroBet — settings: market-data vendors, feed diagnostics, account.

import { VENDORS, getKey, setKey, stockVendor } from "../market/keys.js";
import { onStatus, reconnect, warm } from "../market/feed.js";
import { firebaseConfig } from "../firebase.js";
import { currentUser, mode, modeReason, resetAccount } from "../backend.js";
import { $, $$, esc, toast, confirmDialog } from "../ui.js";

export const settingsPage = {
  mount(outlet) {
    outlet.innerHTML = `
      <section class="page narrow">
        <header class="page-head">
          <div><h1>Settings</h1><p class="muted">Data sources, connection health and account controls.</p></div>
        </header>

        <div class="card">
          <div class="card-head"><h3>Market data</h3><span class="muted small">keys stay in this browser</span></div>
          <div class="pad">
            <p class="muted">
              Crypto and forex need no key — HeroBet reads them straight from public exchange and
              central-bank endpoints. US stocks have no free keyless feed, so connect one vendor below
              and the ${Object.keys(VENDORS).length > 0 ? "stock" : ""} markets light up instantly.
            </p>
            <div id="vendors" class="vendors"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Feed status</h3><button class="btn tiny" id="reconnect">Re-probe venues</button></div>
          <div class="pad" id="statusPanel"></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Backend</h3></div>
          <div class="pad">
            <dl class="kv">
              <div><dt>Mode</dt><dd>${mode === "firestore" ? "Firebase Firestore (live)" : `Local browser storage${modeReason ? " — " + esc(modeReason) : ""}`}</dd></div>
              <div><dt>Project</dt><dd><code>${esc(firebaseConfig.projectId)}</code></dd></div>
              <div><dt>Auth domain</dt><dd><code>${esc(firebaseConfig.authDomain)}</code></dd></div>
              <div><dt>Signed in as</dt><dd id="whoami">—</dd></div>
            </dl>
            ${
              mode === "local"
                ? `<p class="notice small">Firestore isn't answering, so your desk is saved in this browser only.
                   Enable Firestore + Authentication in the Firebase console and reload — see <code>docs/SETUP-FIREBASE.md</code>.</p>`
                : ""
            }
          </div>
        </div>

        <div class="card danger-zone">
          <div class="card-head"><h3>Danger zone</h3></div>
          <div class="pad row between center wrap gap">
            <p class="muted">Reset the trading account back to its opening balance.</p>
            <button class="btn danger" id="reset">Reset account</button>
          </div>
        </div>
      </section>
    `;

    // ── vendors ──
    function paintVendors() {
      const active = stockVendor();
      $("#vendors", outlet).innerHTML = Object.values(VENDORS)
        .map((v) => {
          const key = getKey(v.id);
          return `<div class="vendor ${active === v.id ? "active" : ""}">
            <div class="v-head">
              <div>
                <b>${esc(v.label)}</b>
                ${active === v.id ? `<span class="chip tiny ok">in use</span>` : key ? `<span class="chip tiny">saved</span>` : ""}
                <div class="muted small">${esc(v.covers)} · ${esc(v.free)}</div>
              </div>
              <a class="btn tiny ghost" href="${v.url}" target="_blank" rel="noopener">Get a key ↗</a>
            </div>
            <div class="row gap">
              <input class="input" type="password" data-key="${v.id}" placeholder="Paste API key" value="${esc(key)}" autocomplete="off" />
              <button class="btn small" data-save="${v.id}">Save</button>
              ${key ? `<button class="btn small ghost" data-clear="${v.id}">Clear</button>` : ""}
            </div>
          </div>`;
        })
        .join("");

      $$("[data-save]", outlet).forEach((b) =>
        b.addEventListener("click", async () => {
          const id = b.dataset.save;
          const val = $(`[data-key="${id}"]`, outlet).value.trim();
          setKey(id, val);
          paintVendors();
          toast(val ? `${VENDORS[id].label} key saved — loading stock prices…` : "Key cleared");
          if (val) {
            try {
              await warm("stock");
            } catch {
              /* status panel will show the error */
            }
          }
        })
      );
      $$("[data-clear]", outlet).forEach((b) =>
        b.addEventListener("click", () => {
          setKey(b.dataset.clear, "");
          paintVendors();
          toast("Key cleared");
        })
      );
    }
    paintVendors();

    // ── status ──
    const unsubStatus = onStatus((s) => {
      const el = $("#statusPanel", outlet);
      if (!el) return;
      const line = (name, st) =>
        `<div class="feed-line big">
          <span class="dot ${st.ok ? "on" : st.transport === "locked" ? "warn" : "off"}"></span>
          <b>${name}</b>
          <span class="muted">${st.provider ? esc(st.provider) : "not connected"}${st.detail ? " · " + esc(st.detail) : ""}</span>
          <span class="chip tiny">${esc(st.transport)}</span>
        </div>`;
      el.innerHTML =
        line("Crypto", s.crypto) +
        line("Stocks", s.stock) +
        line("Forex", s.fx) +
        `<h4 class="mt">Venue probe</h4>
         <table class="data-table compact"><tbody>${(s.probe || [])
           .map(
             (p) =>
               `<tr><td><span class="dot ${p.ok ? "on" : "off"}"></span> ${esc(p.id)}</td>
                <td class="num muted">${p.ok ? p.ms + " ms" : esc(p.err || "unreachable")}</td></tr>`
           )
           .join("")}</tbody></table>
         <p class="fineprint">Some networks block individual exchange domains. HeroBet probes every venue and uses the fastest one that answers.</p>`;
    });

    $("#reconnect", outlet).addEventListener("click", async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Probing…";
      await reconnect();
      e.target.disabled = false;
      e.target.textContent = "Re-probe venues";
      toast("Market feed reconnected", "ok");
    });

    const u = currentUser();
    $("#whoami", outlet).textContent = u ? `${u.name}${u.email ? " · " + u.email : " · guest"}` : "not signed in";

    $("#reset", outlet).addEventListener("click", async () => {
      if (!currentUser()) return toast("Sign in first", "warn");
      const ok = await confirmDialog("Reset trading account", "Every position, order and fill is deleted.", "Reset");
      if (!ok) return;
      await resetAccount();
      toast("Account reset", "ok");
    });

    return { destroy: () => unsubStatus() };
  },
};
