/**
 * The local admin console — the GUI half of the OrcaRouter integration.
 *
 * WHY THIS IS NOT A PAGE IN THE RECORD'S SITE. The scaffolded site is a static
 * export: every published document is a file the host serves to whoever asks.
 * Putting a provider credential in it would publish that credential to the same
 * audience as the record — and an OrcaRouter key is a real, billable secret.
 * The site's own `lib/auth/` seam says as much about itself ("it names a
 * reader; it does not decide what they may read"), and it exists to identify a
 * READER, not to hold an inference key.
 *
 * So the console is served by the CLI, on loopback, in the same process that
 * already holds the credential and the DSN. It binds `127.0.0.1:0` — a port
 * nobody else can reach and a port chosen by the OS — and every request is
 * checked to have arrived with a token minted for this run, so a page in the
 * user's browser cannot drive it by guessing a port.
 *
 * The styling is the scaffold's own design language (shadcn neutral tokens,
 * oklch, the same `--primary`), NOT a new one: the console is part of this
 * product and should read as such. It carries no web font and no external
 * request, for the same reason the site does not.
 */

import type { CatalogModel, Capability, InputModality } from "./catalog.js";

/** Everything the page needs to render itself once. */
export interface ConsoleModel {
  readonly appName: string;
  readonly authBase: string;
  readonly apiBase: string;
  readonly keyVar: string;
  readonly maskedKey: string | null;
  readonly credentialSource: string | null;
  readonly consoleUrl: string;
  readonly token: string;
}

const CAPABILITIES: readonly Capability[] = ["chat", "embedding", "image", "video", "rerank"];
const MODALITIES: readonly InputModality[] = ["image", "audio", "video"];

export function renderConsolePage(model: ConsoleModel): string {
  // The token is minted per run and inlined, so the page can call its own
  // server; it is a loopback CSRF guard, not a credential.
  return `<!doctype html>
<html lang="en" data-token="${escapeAttribute(model.token)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OrcaRouter — ${escapeHtml(model.appName)}</title>
<style>
${STYLES}
</style>
</head>
<body>
<main class="page">
  <header class="masthead">
    <!-- The official OrcaRouter mark, loaded from its published URL rather
         than vendored: this page is served live by the CLI on loopback, so an
         external request is not the offline-build problem it is for the static
         site. It hides itself when there is no network, because a broken image
         is worse than no mark. -->
    <img class="mark" src="https://www.orcarouter.ai/orca-logo-classic.png" alt=""
         width="32" height="32" referrerpolicy="no-referrer"
         onerror="this.style.display='none'">
    <div>
      <h1>OrcaRouter</h1>
      <p class="lede">Two ways in. Both produce one <code>sk-orca-…</code> key, billed to
      <em>your</em> OrcaRouter account and revocable by you at any time.</p>
    </div>
  </header>

  <section class="grid" aria-label="Authentication">
    <!-- ── API key ─────────────────────────────────────────────────────── -->
    <article class="card" id="card-key">
      <div class="card-head">
        <h2>API key</h2>
        <span class="tag" id="key-state">not set</span>
      </div>
      <p class="hint">Paste an <code>sk-orca-…</code> you already hold. Kept in
      <code>${escapeHtml(model.keyVar)}</code> in the <code>.env</code> beside your record —
      the same file your DSN lives in, and already gitignored.</p>
      <label class="field">
        <span class="label">Key</span>
        <input id="key-input" type="password" autocomplete="off" spellcheck="false"
               placeholder="sk-orca-…" aria-describedby="key-note">
      </label>
      <p class="note" id="key-note" role="status"></p>
      <div class="row">
        <button id="key-save" class="btn primary" type="button">Save key</button>
        <button id="key-clear" class="btn" type="button">Clear</button>
      </div>
      <p class="masked"><span class="label">Stored</span>
        <code id="key-masked">${escapeHtml(model.maskedKey ?? "—")}</code></p>
    </article>

    <!-- ── Connect with OrcaRouter ─────────────────────────────────────── -->
    <article class="card" id="card-connect">
      <div class="card-head">
        <h2>Connect with OrcaRouter</h2>
        <span class="tag" id="connect-state">idle</span>
      </div>
      <p class="hint">Authorize this machine in your browser (OAuth 2.0 + PKCE, S256). No client
      secret, no redirect URI to register — and the code is redeemable only by this process,
      because the verifier never leaves it.</p>
      <div class="row">
        <button id="connect-start" class="btn primary" type="button">Connect with OrcaRouter</button>
        <button id="connect-cancel" class="btn" type="button" disabled>Cancel</button>
      </div>
      <label class="field">
        <span class="label">Authorization URL <span class="dim">(open it yourself if no browser
        opened)</span></span>
        <div class="copy">
          <input id="connect-url" type="text" readonly value="" aria-label="Authorization URL">
          <button id="connect-copy" class="btn" type="button">Copy</button>
        </div>
      </label>
      <label class="field" id="connect-code-field" hidden>
        <span class="label">Code shown on the consent screen</span>
        <div class="copy">
          <input id="connect-code" type="text" autocomplete="off" spellcheck="false" placeholder="paste the code">
          <button id="connect-code-submit" class="btn" type="button">Exchange</button>
        </div>
      </label>
      <p class="note" id="connect-note" role="status"></p>
    </article>
  </section>

  <!-- ── Model catalog ─────────────────────────────────────────────────── -->
  <section class="card wide" id="card-models" aria-label="Models">
    <div class="card-head">
      <h2>Models</h2>
      <span class="tag" id="catalog-state">loading</span>
    </div>
    <p class="hint">Read from <code>${escapeHtml(model.apiBase)}/models</code> — the only
    authority on what this credential can reach. The options below are filtered to what the
    chosen entry point can actually send.</p>
    <div class="controls">
      <label class="field">
        <span class="label">Capability</span>
        <select id="capability">${CAPABILITIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
      </label>
      <label class="field">
        <span class="label">Attachment</span>
        <select id="modality">
          <option value="">none (text only)</option>
          ${MODALITIES.map((m) => `<option value="${m}">${m}</option>`).join("")}
        </select>
      </label>
      <div class="field grow">
        <span class="label" id="model-label">Model</span>
        <div class="combo">
          <button id="model-trigger" class="trigger" type="button" role="combobox"
                  aria-expanded="false" aria-controls="model-panel" aria-labelledby="model-label">
            <span id="model-trigger-text">Select a model</span>
            <span class="caret" aria-hidden="true">▾</span>
          </button>
          <div id="model-panel" class="panel" role="listbox" aria-labelledby="model-label" hidden>
            <input id="model-filter" type="text" placeholder="Search models…"
                   aria-label="Search models" autocomplete="off" spellcheck="false">
            <ul id="model-list"></ul>
            <p id="model-empty" class="empty" hidden>No model matches. Widen the capability or
            remove the attachment.</p>
          </div>
        </div>
      </div>
      <button id="catalog-refresh" class="btn" type="button">Refresh</button>
    </div>
    <p class="note" id="catalog-note" role="status"></p>
  </section>

  <footer class="foot">
    <span>Auth origin <code>${escapeHtml(model.authBase)}</code></span>
    <span>Relay base <code>${escapeHtml(model.apiBase)}</code></span>
    <span class="dim" id="console-url">${escapeHtml(model.consoleUrl)}</span>
  </footer>
</main>
<script>
${SCRIPT}
</script>
</body>
</html>`;
}

/** Escape text for an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The same, plus the characters that would break out of an unquoted context. */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

/** Serialize the model list for the page. Escaped for `<` so a model name is data, not markup. */
export function catalogPayload(models: readonly CatalogModel[]): string {
  return JSON.stringify(
    models.map((m) => ({
      id: m.id,
      name: m.name,
      context: m.contextLength,
      input: m.inputModalities,
      reasoning: m.reasoningEfforts,
      source: m.source,
    })),
  ).replaceAll("<", "\\u003c");
}

// ---------------------------------------------------------------------------

// The scaffold's own tokens (system/site/app/global.css), inlined. Two themes,
// the same `--primary`, and no web font — a console that fetched one could not
// start offline, which is exactly when a user is most likely to be fixing an
// API key.
const STYLES = `
:root{
  --background:oklch(1 0 0); --foreground:oklch(0.17 0.012 255);
  --card:oklch(0.985 0.002 255); --muted:oklch(0.972 0.002 255);
  --muted-foreground:oklch(0.53 0.012 255); --primary:#1d4ed8; --primary-foreground:#fff;
  --destructive:oklch(0.577 0.245 27.325); --border:oklch(0.9 0.004 255);
  --input:oklch(0.9 0.004 255); --ring:#1d4ed8; --radius:0.5rem;
}
@media (prefers-color-scheme: dark){
  :root{
    --background:oklch(0.145 0 0); --foreground:oklch(0.985 0 0);
    --card:oklch(0.205 0 0); --muted:oklch(0.269 0 0);
    --muted-foreground:oklch(0.708 0 0); --border:oklch(1 0 0 / 12%);
    --input:oklch(1 0 0 / 16%);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--foreground);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
.page{max-width:74rem;margin:0 auto;padding:2.5rem 1.5rem 4rem;display:flex;flex-direction:column;gap:1.5rem}
.masthead{display:flex;gap:1rem;align-items:flex-start}
.mark{flex:none;border-radius:8px}
h1{font-size:1.35rem;margin:0 0 .25rem;letter-spacing:-.01em}
h2{font-size:1rem;margin:0;letter-spacing:-.005em}
.lede{margin:0;color:var(--muted-foreground);max-width:52rem}
.grid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(22rem,1fr))}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  padding:1.25rem;display:flex;flex-direction:column;gap:.85rem}
.card.wide{grid-column:1/-1}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.tag{font-size:.75rem;color:var(--muted-foreground);border:1px solid var(--border);
  border-radius:999px;padding:.1rem .55rem;white-space:nowrap}
.tag[data-tone=ok]{color:var(--primary);border-color:var(--primary)}
.tag[data-tone=warn]{color:var(--destructive);border-color:var(--destructive)}
.hint{margin:0;color:var(--muted-foreground);font-size:.9rem}
.note{margin:0;font-size:.85rem;min-height:1.2em;color:var(--muted-foreground)}
.note[data-tone=bad]{color:var(--destructive)}
.field{display:flex;flex-direction:column;gap:.35rem}
.field.grow{flex:1 1 18rem}
.label{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-foreground)}
.dim{text-transform:none;letter-spacing:0;font-weight:400}
input,select{font:inherit;color:var(--foreground);background:var(--background);
  border:1px solid var(--input);border-radius:calc(var(--radius) - 2px);padding:.5rem .6rem;width:100%}
input:focus-visible,select:focus-visible,button:focus-visible,.btn:focus-visible{
  outline:2px solid var(--ring);outline-offset:2px}
input[readonly]{color:var(--muted-foreground)}
.row{display:flex;gap:.5rem;flex-wrap:wrap}
.controls{display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end}
.btn{font:inherit;font-size:.9rem;background:var(--background);color:var(--foreground);
  border:1px solid var(--border);border-radius:calc(var(--radius) - 2px);padding:.5rem .85rem;cursor:pointer}
.btn:hover:not(:disabled){background:var(--muted)}
.btn.primary{background:var(--primary);color:var(--primary-foreground);border-color:var(--primary)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.copy{display:flex;gap:.5rem}
.copy input{flex:1 1 auto;min-width:0}
.masked{display:flex;gap:.5rem;align-items:baseline;margin:0;font-size:.9rem}
.combo{position:relative}
.trigger{font:inherit;font-size:.9rem;width:100%;display:flex;justify-content:space-between;
  align-items:center;gap:1rem;text-align:left;background:var(--background);color:var(--foreground);
  border:1px solid var(--input);border-radius:calc(var(--radius) - 2px);padding:.5rem .6rem;cursor:pointer}
.trigger:hover{background:var(--muted)}
.trigger .caret{color:var(--muted-foreground);font-size:.75rem}
#model-trigger-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem}
#model-trigger-text[data-empty=true]{font-family:inherit;color:var(--muted-foreground)}
/* Opens UPWARD. The model control sits near the foot of the page, so a panel
   hung below it is clipped by the viewport however tall the window is — the
   list is 16 entries on a real account, and a dropdown whose options cannot be
   reached is a dropdown that does not work. Anchoring the panel's bottom edge
   to the trigger's top edge puts the whole list in view, and keeps the
   right-edge alignment the layout check reads. */
.panel{position:absolute;z-index:20;bottom:calc(100% + .35rem);right:0;width:min(34rem,90vw);
  max-height:min(60vh,26rem);background:var(--background);border:1px solid var(--border);
  border-radius:var(--radius);box-shadow:0 12px 32px oklch(0 0 0 / 18%);padding:.5rem;
  display:flex;flex-direction:column;gap:.4rem}
.panel[hidden]{display:none}
#model-list{list-style:none;margin:0;padding:0;overflow:auto;min-height:0}
#model-list li{padding:.45rem .55rem;border-radius:calc(var(--radius) - 3px);cursor:pointer;
  display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
#model-list li:hover,#model-list li[aria-selected=true]{background:var(--muted)}
#model-list .meta{color:var(--muted-foreground);font-size:.78rem;white-space:nowrap}
.empty{margin:0;padding:.6rem;color:var(--muted-foreground);font-size:.9rem}
.foot{display:flex;gap:1.25rem;flex-wrap:wrap;color:var(--muted-foreground);font-size:.82rem;
  border-top:1px solid var(--border);padding-top:1rem}
`;

// ---------------------------------------------------------------------------

// The page's behaviour. Deliberately one small script with no framework: the
// console is served by the CLI and must run without a build step, offline.
//
// The two things worth reading twice are the GENERATION guard and the
// `pagehide` handler. A login is asynchronous and a user can start a second
// one, cancel, or navigate away while the first is in flight; every response
// is checked against the generation that asked for it, so a late answer cannot
// install a credential under a newer attempt. `pagehide` is separate from that
// guard on purpose — invalidation makes the guarded `finally` refuse to touch
// state, which would leave a back-forward-cache restore permanently busy, so
// the handler clears busy/hint SYNCHRONOUSLY and then tells the server with
// `keepalive`.
const SCRIPT = String.raw`
const TOKEN = document.documentElement.dataset.token;
const $ = (id) => document.getElementById(id);

const state = {
  generation: 0,          // monotonic; bumped by every login attempt
  busy: false,
  models: [],
  catalog: { source: null, degraded: false, reason: null, count: 0 },
  selected: null,
  pendingCode: false,
};

const api = async (path, init = {}) => {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-ksor-token": TOKEN, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  return { ok: res.ok, status: res.status, body };
};

const setNote = (el, message, tone) => {
  el.textContent = message || "";
  if (tone) el.dataset.tone = tone; else delete el.dataset.tone;
};

// ── Authentication method: API key ─────────────────────────────────────────
async function refreshStatus() {
  const { ok, body } = await api("/api/status");
  if (!ok || !body) return;
  $("key-masked").textContent = body.masked_key || "—";
  const tag = $("key-state");
  if (body.masked_key) {
    tag.textContent = body.credential_source === "pkce" ? "connected (browser)" : "connected (key)";
    tag.dataset.tone = "ok";
  } else {
    tag.textContent = "not set";
    delete tag.dataset.tone;
  }
  applyCatalog(body.catalog);
}

$("key-save").addEventListener("click", async () => {
  const value = $("key-input").value;
  if (!value) { setNote($("key-note"), "Enter a key first.", "bad"); return; }
  const { ok, body } = await api("/api/key", { method: "POST", body: JSON.stringify({ key: value }) });
  // The input is cleared whatever happens: a key left in a form field is a key
  // left on screen.
  $("key-input").value = "";
  setNote($("key-note"), body && body.message ? body.message : (ok ? "Saved." : "Refused."), ok ? null : "bad");
  await refreshStatus();
});

$("key-clear").addEventListener("click", async () => {
  const { ok, body } = await api("/api/key", { method: "DELETE" });
  setNote($("key-note"), body && body.message ? body.message : "", ok ? null : "bad");
  await refreshStatus();
});

// ── Authentication method: Connect with OrcaRouter (PKCE) ──────────────────
function renderConnect(busy, hint) {
  state.busy = busy;
  $("connect-start").disabled = busy;
  $("connect-cancel").disabled = !busy;
  const tag = $("connect-state");
  tag.textContent = busy ? "waiting for approval" : "idle";
  if (busy) tag.dataset.tone = "ok"; else delete tag.dataset.tone;
  if (hint !== undefined) setNote($("connect-note"), hint);
}

async function startLogin() {
  const generation = ++state.generation;   // claim this attempt
  renderConnect(true, "Opening your browser…");
  $("connect-url").value = "";
  $("connect-code-field").hidden = true;
  const { ok, body } = await api("/api/connect/start", { method: "POST", body: "{}" });
  if (generation !== state.generation) return;   // a newer attempt took over
  if (!ok || !body) { renderConnect(false, "Could not start the authorization."); return; }
  $("connect-url").value = body.url || "";
  $("connect-code-field").hidden = !body.out_of_band;
  state.pendingCode = !!body.out_of_band;
  renderConnect(true, body.out_of_band
    ? "Approve in your browser, then paste the code it shows."
    : "Waiting for you to approve in the browser…");
  poll(generation);
}

async function poll(generation) {
  while (generation === state.generation && state.busy) {
    const { ok, body } = await api("/api/connect/poll?generation=" + generation);
    // A response from a superseded attempt is DISCARDED, not applied — this is
    // the guard that stops a slow answer from installing a credential under a
    // login the user has already restarted.
    if (generation !== state.generation) return;
    if (!ok || !body) { renderConnect(false, "The console lost contact with its own server."); return; }
    if (body.status === "done") {
      renderConnect(false, "Connected. The key is stored and now in use.");
      await refreshStatus();
      return;
    }
    if (body.status === "error" || body.status === "cancelled") {
      renderConnect(false, body.message || "Authorization did not complete.");
      if (body.status === "error") setNote($("connect-note"), body.message, "bad");
      return;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

$("connect-start").addEventListener("click", () => { void startLogin(); });

$("connect-cancel").addEventListener("click", async () => {
  const generation = state.generation;
  state.generation++;                      // invalidate the attempt immediately
  renderConnect(false, "Cancelled.");
  await api("/api/connect/cancel", { method: "POST", body: JSON.stringify({ generation }) });
});

$("connect-copy").addEventListener("click", async () => {
  const url = $("connect-url").value;
  if (!url) return;
  try { await navigator.clipboard.writeText(url); setNote($("connect-note"), "Authorization URL copied."); }
  catch { $("connect-url").select(); setNote($("connect-note"), "Select and copy the URL above."); }
});

$("connect-code-submit").addEventListener("click", async () => {
  const code = $("connect-code").value.trim();
  if (!code) return;
  const generation = state.generation;
  const { ok, body } = await api("/api/connect/code", {
    method: "POST", body: JSON.stringify({ generation, code }),
  });
  $("connect-code").value = "";
  if (generation !== state.generation) return;
  if (!ok) { setNote($("connect-note"), (body && body.message) || "That code was refused.", "bad"); }
});

// ── The back-forward cache ─────────────────────────────────────────────────
// The browser may restore this page from the bfcache, in which case NO React
// lifecycle runs and the guarded poll above has already refused to clean up.
// So the handler clears the UI state synchronously and tells the server with
// keepalive, which is the only request that survives the page going away.
window.addEventListener("pagehide", () => {
  state.generation++;
  state.busy = false;
  state.pendingCode = false;
  // Synchronous, so a restored page is never permanently busy.
  $("connect-start").disabled = false;
  $("connect-cancel").disabled = true;
  $("connect-state").textContent = "idle";
  delete $("connect-state").dataset.tone;
  setNote($("connect-note"), "Authorization cancelled — the page was left.");
  $("connect-code-field").hidden = true;
  try {
    fetch("/api/connect/cancel", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ksor-token": TOKEN },
      body: JSON.stringify({ generation: state.generation }),
      keepalive: true,
    });
  } catch { /* the page is going away; the server's timeout is the backstop */ }
});

// ── Model catalog ──────────────────────────────────────────────────────────
function applyCatalog(catalog) {
  if (!catalog) return;
  state.models = catalog.models || [];
  state.catalog = catalog;
  const tag = $("catalog-state");
  if (catalog.degraded) {
    tag.textContent = "degraded — " + (catalog.reason || "catalog unavailable");
    tag.dataset.tone = "warn";
    setNote($("catalog-note"),
      "Showing the built-in verified list, not your account's catalog. " +
      "Reasoning and input-modality metadata is preserved; refresh when the network is back.", "bad");
  } else {
    tag.textContent = state.models.length + " models";
    delete tag.dataset.tone;
    setNote($("catalog-note"), "Live from " + catalog.api_base + "/models.");
  }
  // A selection the new list no longer offers is CLEARED, never silently kept.
  if (state.selected && !state.models.some((m) => m.id === state.selected)) {
    state.selected = null;
    setTrigger("Select a model", true);
    setNote($("catalog-note"), "The previous model is not available for this capability — pick another.", "bad");
  }
  // No options at all: say so on the trigger rather than leaving a stale name.
  if (!state.selected && state.models.length === 0) setTrigger("No compatible model", true);
  renderList();
}

async function reloadCatalog() {
  const capability = $("capability").value;
  const input = $("modality").value;
  const query = "/api/catalog?capability=" + encodeURIComponent(capability) +
    (input ? "&input=" + encodeURIComponent(input) : "");
  const { ok, body } = await api(query);
  if (!ok || !body) return;
  applyCatalog(body);
}

function renderList() {
  const filter = $("model-filter").value.trim().toLowerCase();
  const list = $("model-list");
  list.textContent = "";
  const shown = state.models.filter((m) =>
    filter === "" || m.id.toLowerCase().includes(filter) || (m.name || "").toLowerCase().includes(filter));
  for (const model of shown) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(model.id === state.selected));
    li.dataset.id = model.id;
    const name = document.createElement("span");
    name.textContent = model.id;
    const meta = document.createElement("span");
    meta.className = "meta";
    const bits = [];
    if (model.context) bits.push(Math.round(model.context / 1000) + "k ctx");
    if (model.input && model.input.length) bits.push(model.input.join("+"));
    if (model.reasoning && model.reasoning.length) bits.push("effort: " + model.reasoning.join("/"));
    meta.textContent = bits.join(" · ");
    li.append(name, meta);
    li.addEventListener("click", () => selectModel(model.id));
    list.append(li);
  }
  $("model-empty").hidden = shown.length > 0;
}

function setTrigger(text, empty) {
  $("model-trigger-text").textContent = text;
  if (empty) $("model-trigger-text").dataset.empty = "true";
  else delete $("model-trigger-text").dataset.empty;
}

function selectModel(id) {
  state.selected = id;
  setTrigger(id, false);
  closePanel();
}

function openPanel() {
  $("model-panel").hidden = false;
  $("model-trigger").setAttribute("aria-expanded", "true");
  $("model-filter").focus();
}
function closePanel() {
  $("model-panel").hidden = true;
  $("model-trigger").setAttribute("aria-expanded", "false");
}
$("model-trigger").addEventListener("click", () => {
  if ($("model-panel").hidden) openPanel(); else closePanel();
});
$("model-trigger").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});
$("model-filter").addEventListener("input", renderList);
$("model-filter").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closePanel(); $("model-trigger").focus(); }
});
document.addEventListener("click", (e) => {
  if (!$("card-models").contains(e.target)) closePanel();
});
// Both of these RECOMPUTE the options — a provider or an attachment change is
// exactly when the previous list stops being the right one.
$("capability").addEventListener("change", () => { void reloadCatalog(); });
$("modality").addEventListener("change", () => { void reloadCatalog(); });
$("catalog-refresh").addEventListener("click", () => { void reloadCatalog(); });

setTrigger("Select a model", true);
void refreshStatus();
`;
