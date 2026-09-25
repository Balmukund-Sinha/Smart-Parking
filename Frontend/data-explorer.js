(() => {
  "use strict";

  const ROUTES = {
    overview: "/overview",
    "live-monitoring": "/live-monitoring",
    "parking-map": "/parking-map",
    "historical-analytics": "/historical-analytics",
    "demand-prediction": "/demand-prediction",
    "big-data-pipeline": "/big-data-pipeline",
    "data-explorer": "/data-explorer",
    "system-health": "/system-health"
  };
  const state = { catalog: null, data: null, query: null, stream: null, layer: "raw", page: 1, limit: 10, search: "", view: "table" };
  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (value, digits) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits == null ? 0 : digits });
  const bytes = (value) => { const n = Number(value || 0); if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GB"; if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB"; if (n >= 1024) return (n / 1024).toFixed(1) + " KB"; return fmt(n) + " B"; };
  const byText = (selector, text, root) => [...(root || document).querySelectorAll(selector)].find((node) => clean(node.textContent).includes(text));

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || "Request failed (" + response.status + ")");
    return payload;
  }

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = [
      ":root{--sp-canvas:#040810;--sp-shell:#070d18;--sp-card:#0c1524;--sp-high:#121e33;--sp-top:#182742;--sp-line:rgba(148,163,184,.17);--sp-text:#e2e8f0;--sp-muted:#94a3b8;--sp-faint:#64748b;--sp-cyan:#38bdf8;--sp-teal:#2dd4bf;--sp-green:#34d399;--sp-red:#f87171;--sp-amber:#fbbf24;--sp-purple:#a78bfa}",
      "html{font-size:19px!important;background:var(--sp-canvas)!important}body{line-height:1.5;background:var(--sp-canvas)!important;color:var(--sp-text)!important}.bg-background{background-color:var(--sp-canvas)!important}.bg-surface-container-low{background-color:var(--sp-shell)!important}.bg-surface-container-lowest{background-color:#03070d!important}.bg-surface-container{background-color:var(--sp-card)!important}.bg-surface-container-high{background-color:var(--sp-high)!important}.bg-surface-container-highest{background-color:var(--sp-top)!important}.text-on-surface{color:var(--sp-text)!important}.text-on-surface-variant{color:var(--sp-muted)!important}.text-outline{color:var(--sp-faint)!important}.text-primary{color:var(--sp-cyan)!important}.text-secondary{color:var(--sp-teal)!important}.text-tertiary{color:var(--sp-green)!important}.bg-primary{background:#0891b2!important}.bg-primary-container{background:#0e7490!important}.border-surface-variant,.border-outline-variant{border-color:var(--sp-line)!important}",
      ".text-\\[9px\\]{font-size:13px!important}.text-\\[10px\\]{font-size:13px!important}.text-\\[11px\\]{font-size:14px!important}button,input,select{min-height:42px;font-size:14px!important}aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}aside nav a{min-height:47px;border:1px solid transparent;border-radius:8px!important}aside nav a[aria-current=page]{background:rgba(8,145,178,.25)!important;border-color:rgba(34,211,238,.35)!important;color:#fff!important}aside nav a[aria-current=page] span{color:#f8fafc!important}aside nav a[aria-current=page] .material-symbols-outlined{color:#67e8f9!important}aside[data-collapsed=true]{transform:translateX(-100%)!important}aside[data-collapsed=true]+div.pl-72{padding-left:0!important}aside[data-collapsed=true]+div.pl-72>header{left:0!important}body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}",
      ".sp-page{display:grid;gap:18px;padding-top:18px;padding-bottom:38px}.sp-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.sp-eyebrow{display:flex;gap:9px;align-items:center;color:var(--sp-cyan);font:700 12px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase}.sp-live{padding:4px 8px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--sp-green);border:1px solid rgba(52,211,153,.24)}.sp-hero h1{font-size:34px;line-height:1.08;letter-spacing:-.035em;color:#fff;margin:9px 0 6px;font-weight:800}.sp-hero p{color:var(--sp-muted);font-size:15px;max-width:850px}.sp-actions,.sp-toolbar,.sp-tabs{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.sp-actions{justify-content:flex-end}.sp-btn{border:1px solid var(--sp-line);background:var(--sp-high);color:var(--sp-text);border-radius:8px;padding:9px 13px;font-weight:700;transition:.18s}.sp-btn:hover{border-color:rgba(56,189,248,.55);transform:translateY(-1px)}.sp-btn.primary{background:linear-gradient(90deg,#0891b2,#14b8a6);border-color:#22d3ee;color:#fff}.sp-btn.active{background:rgba(56,189,248,.15);border-color:var(--sp-cyan);color:var(--sp-cyan)}.sp-btn:disabled{opacity:.55;cursor:wait;transform:none}",
      ".sp-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}.sp-kpi,.sp-card{background:var(--sp-card);border:1px solid var(--sp-line);border-radius:13px;box-shadow:0 14px 40px rgba(0,0,0,.16)}.sp-kpi{padding:15px;min-height:128px}.sp-kpi-head{display:flex;justify-content:space-between;gap:8px;color:var(--sp-muted);font:700 11px 'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.06em}.sp-kpi-head .material-symbols-outlined{font-size:21px;color:var(--sp-cyan)}.sp-kpi-value{font-size:28px;font-weight:800;color:#fff;letter-spacing:-.04em;margin:11px 0 4px}.sp-kpi-value.cyan{color:var(--sp-cyan)}.sp-kpi-value.green{color:var(--sp-green)}.sp-kpi-note{font-size:12px;color:var(--sp-muted)}.sp-card{padding:18px}.sp-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px}.sp-card-head h2{font-size:20px;color:#fff;line-height:1.2;margin:0}.sp-card-head p{font-size:13px;color:var(--sp-muted);margin:4px 0 0}.sp-badge{padding:5px 8px;border-radius:6px;background:var(--sp-top);color:var(--sp-cyan);font:700 12px 'JetBrains Mono',monospace;white-space:nowrap}.sp-badge.green{color:var(--sp-green);background:rgba(52,211,153,.1)}",
      ".sp-layers{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}.sp-layer{position:relative;text-align:left;padding:15px;background:var(--sp-shell);border:1px solid var(--sp-line);border-radius:10px;color:inherit;min-height:143px}.sp-layer:hover,.sp-layer.active{border-color:rgba(56,189,248,.55);background:var(--sp-high)}.sp-layer.active:after{content:'';position:absolute;left:0;bottom:0;height:3px;width:100%;background:linear-gradient(90deg,var(--sp-cyan),var(--sp-teal))}.sp-layer-top{display:flex;justify-content:space-between;gap:8px}.sp-layer-icon{width:38px;height:38px;border-radius:8px;display:grid;place-items:center;background:rgba(56,189,248,.1);color:var(--sp-cyan)}.sp-layer h3{font-size:15px;color:#fff;margin:11px 0 3px}.sp-layer p{font-size:12px;color:var(--sp-muted);margin:0}.sp-layer-stat{font:700 11px 'JetBrains Mono',monospace;color:var(--sp-green)}",
      ".sp-workspace{display:grid;grid-template-columns:minmax(330px,.7fr) minmax(0,1.7fr);gap:18px;align-items:start}.sp-schema{display:grid;gap:8px;max-height:620px;overflow:auto;padding-right:3px}.sp-field{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px 12px;border:1px solid var(--sp-line);background:var(--sp-shell);border-radius:8px}.sp-field b{font:700 13px 'JetBrains Mono',monospace;color:var(--sp-text);word-break:break-word}.sp-field span{font:700 11px 'JetBrains Mono',monospace;color:var(--sp-cyan)}.sp-field small{grid-column:1/-1;color:var(--sp-muted);font-size:11px}.sp-console{display:block;min-width:0;overflow:hidden}.sp-console>*{min-width:0;max-width:100%;box-sizing:border-box}.sp-console>*+*{margin-top:13px}.sp-console>.sp-card-head{width:auto}.sp-card-head>div{min-width:0}.sp-query-controls{display:grid;grid-template-columns:minmax(0,1fr) 100px 140px;gap:9px;width:auto}.sp-query-controls>*{min-width:0;max-width:100%}.sp-input,.sp-select{box-sizing:border-box;width:100%;min-height:42px;border:1px solid var(--sp-line);border-radius:8px;background:var(--sp-shell);color:var(--sp-text);padding:9px 11px;outline:none}.sp-input:focus,.sp-select:focus{border-color:var(--sp-cyan);box-shadow:0 0 0 3px rgba(56,189,248,.1)}.sp-sql{margin:0;background:#03070d;border:1px solid var(--sp-line);border-radius:9px;padding:13px;min-height:86px;color:var(--sp-cyan);font:12px/1.55 'JetBrains Mono',monospace;white-space:pre-wrap}.sp-query-meta{display:flex;flex-wrap:wrap;gap:8px}",
      ".sp-table-wrap{border:1px solid var(--sp-line);border-radius:9px;overflow:auto;max-height:500px;background:var(--sp-shell)}.sp-table{border-collapse:collapse;width:100%;min-width:900px}.sp-table th{position:sticky;top:0;z-index:1;background:var(--sp-top);color:var(--sp-cyan);font:700 11px 'JetBrains Mono',monospace;text-align:left;padding:11px 12px;text-transform:uppercase;letter-spacing:.04em}.sp-table td{border-top:1px solid var(--sp-line);padding:11px 12px;color:var(--sp-text);font:12px/1.45 'JetBrains Mono',monospace;white-space:nowrap}.sp-table tbody tr:hover{background:rgba(56,189,248,.05)}.sp-json{margin:0;background:#03070d;color:var(--sp-cyan);font:12px/1.55 'JetBrains Mono',monospace;padding:14px;max-height:500px;overflow:auto;white-space:pre-wrap}.sp-pager{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;color:var(--sp-muted);font-size:13px}",
      ".sp-bottom{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;align-items:start}.sp-partitions{display:grid;gap:9px}.sp-partition{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;padding:11px;background:var(--sp-shell);border:1px solid var(--sp-line);border-radius:8px;align-items:center}.sp-partition b{color:#fff;font:700 12px 'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis}.sp-partition span{color:var(--sp-muted);font-size:12px}.sp-quality{display:grid;gap:11px}.sp-quality-row{display:grid;gap:6px}.sp-quality-head{display:flex;justify-content:space-between;gap:10px;font-size:13px}.sp-quality-head b{color:#fff}.sp-quality-head span{color:var(--sp-green);font:700 12px 'JetBrains Mono',monospace}.sp-bar{height:9px;border-radius:99px;background:var(--sp-top);overflow:hidden}.sp-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0891b2,var(--sp-green))}.sp-quality-row small{color:var(--sp-muted);font-size:11px}.sp-viva{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:15px;align-items:center}.sp-viva-icon{width:48px;height:48px;border-radius:11px;display:grid;place-items:center;background:rgba(56,189,248,.14);color:var(--sp-cyan)}.sp-viva h2{font-size:18px;color:#fff;margin:0 0 4px}.sp-viva p{font-size:13px;color:var(--sp-muted);line-height:1.55;margin:0}.sp-empty{padding:35px;text-align:center;color:var(--sp-muted)}",
      "#sp-toasts{position:fixed;right:18px;bottom:18px;z-index:2200;display:grid;gap:8px;max-width:430px}.sp-toast{background:var(--sp-high);border:1px solid rgba(56,189,248,.4);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 13px/1.5 'JetBrains Mono',monospace}.sp-toast.error{border-color:rgba(248,113,113,.55);color:#fecaca}",
      "@media(max-width:1550px){html{font-size:18px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}.sp-kpis{grid-template-columns:repeat(3,1fr)}.sp-layers{grid-template-columns:repeat(3,1fr)}}@media(max-width:1100px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}.sp-workspace,.sp-bottom{grid-template-columns:1fr}.sp-hero{align-items:flex-start;flex-direction:column}.sp-actions{justify-content:flex-start}}@media(max-width:720px){.sp-kpis,.sp-layers{grid-template-columns:1fr}.sp-query-controls{grid-template-columns:1fr}.sp-viva{grid-template-columns:1fr}.sp-hero h1{font-size:29px}}"
    ].join("");
    document.head.appendChild(style);
    const toasts = document.createElement("div");
    toasts.id = "sp-toasts";
    document.body.appendChild(toasts);
  }

  function toast(message, error) {
    const item = document.createElement("div");
    item.className = "sp-toast" + (error ? " error" : "");
    item.textContent = message;
    document.querySelector("#sp-toasts").appendChild(item);
    setTimeout(() => item.remove(), 4300);
  }

  function download(url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((anchor) => {
      const path = anchor.dataset.path;
      anchor.href = ROUTES[path] || "#";
      const active = path === "data-explorer";
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current");
      anchor.classList.toggle("bg-primary-container", active);
      anchor.classList.toggle("text-on-primary-container", active);
      anchor.classList.toggle("font-semibold", active);
      anchor.classList.toggle("text-on-surface-variant", !active);
      if (!active) anchor.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("body > div.pl-72 > header span", "Executive Overview") || byText("body > div.pl-72 > header span", "Data Explorer");
    if (context) context.textContent = "Data Explorer";
    const collapse = byText("aside span", "Collapse Dock");
    if (collapse && collapse.parentElement) collapse.parentElement.onclick = () => {
      const aside = document.querySelector("aside");
      aside.dataset.collapsed = String(aside.dataset.collapsed !== "true");
    };
  }

  function updateChrome() {
    const header = document.querySelector("body > div.pl-72 > header");
    if (!header || !state.stream) return;
    const live = byText("span", "ev/s", header);
    if (live) live.textContent = fmt(state.stream.summary.events_per_second, 2) + " ev/s";
    const clock = [...header.querySelectorAll("span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent)));
    if (clock) clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
  }

  function buildPage() {
    const layers = state.catalog.layers || [];
    const raw = layers.find((item) => item.id === "raw") || {};
    const silver = layers.find((item) => item.id === "silver") || {};
    const totalRows = layers.reduce((sum, item) => sum + Number(item.rows || 0), 0);
    const kpis = [
      ["database", "Catalog rows", fmt(totalRows), "Across five governed datasets", "cyan"],
      ["table_view", "Bronze events", fmt(raw.rows), fmt(raw.columns) + " typed columns", ""],
      ["dataset", "Silver features", fmt(silver.rows), "Model-ready feature records", "green"],
      ["folder_zip", "Parquet lake", fmt(state.catalog.parquet.files), bytes(state.catalog.parquet.bytes) + " on disk", "cyan"],
      ["verified", "Data quality", fmt(state.catalog.quality_average, 1) + "%", fmt(state.catalog.sample_size) + " records validated", "green"]
    ];
    const main = document.querySelector("main > div");
    main.innerHTML = '<div class="sp-page">' +
      '<section class="sp-hero"><div><div class="sp-eyebrow"><span>Parquet Delta Lakehouse</span><span>Tier-2 telemetry</span><span class="sp-live">Metastore live</span></div><h1>Data Lake & Schema Explorer</h1><p>Browse Bronze, Silver, serving, and inference datasets; inspect typed schemas; run safe analytical templates; and export governed artifacts.</p></div><div class="sp-actions"><button class="sp-btn primary" id="sp-sync">Sync metastore</button><button class="sp-btn" id="sp-console-jump">SQL console</button><button class="sp-btn" id="sp-parquet">Export Parquet</button><button class="sp-btn" id="sp-ddl">DDL schema</button></div></section>' +
      '<section class="sp-kpis">' + kpis.map((item) => '<article class="sp-kpi"><div class="sp-kpi-head"><span>' + esc(item[1]) + '</span><span class="material-symbols-outlined">' + item[0] + '</span></div><div class="sp-kpi-value ' + item[4] + '">' + esc(item[2]) + '</div><div class="sp-kpi-note">' + esc(item[3]) + '</div></article>').join("") + '</section>' +
      '<section class="sp-card"><div class="sp-card-head"><div><h2>Lakehouse Catalog</h2><p>Select a governed layer to inspect its real schema and materialized records.</p></div><span class="sp-badge green">' + layers.length + ' datasets registered</span></div><div class="sp-layers" id="sp-layers"></div></section>' +
      '<section class="sp-workspace"><article class="sp-card"><div class="sp-card-head"><div><h2 id="sp-schema-title">Bronze Schema</h2><p>Inferred physical types and nullability.</p></div><span class="sp-badge" id="sp-schema-count">0 fields</span></div><div class="sp-schema" id="sp-schema"></div></article>' +
      '<article class="sp-card sp-console" id="sp-console"><div class="sp-card-head"><div><h2>Safe SQL Query Console</h2><p>Allow-listed analytical templates only; arbitrary shell or SQL execution is disabled.</p></div><span class="sp-badge green">Read only</span></div><div class="sp-query-controls"><select class="sp-select" id="sp-template"><option value="capacity_pressure">Capacity pressure</option><option value="recent_events">Recent Bronze events</option><option value="silver_features">Silver ML features</option><option value="forecast_validation">Forecast validation</option></select><select class="sp-select" id="sp-query-limit"><option>10</option><option>25</option><option>50</option><option>100</option></select><button class="sp-btn primary" id="sp-run">Execute query</button></div><pre class="sp-sql" id="sp-sql">Loading query plan...</pre><div class="sp-query-meta" id="sp-query-meta"></div><div class="sp-toolbar"><input class="sp-input" id="sp-search" placeholder="Filter current dataset across any field..." value=""><button class="sp-btn active" id="sp-table-view">Table grid</button><button class="sp-btn" id="sp-json-view">JSON dump</button></div><div id="sp-data-output"></div><div class="sp-pager"><span id="sp-page-meta"></span><div class="sp-toolbar"><button class="sp-btn" id="sp-prev">Previous</button><button class="sp-btn" id="sp-next">Next</button></div></div></article></section>' +
      '<section class="sp-bottom"><article class="sp-card"><div class="sp-card-head"><div><h2>Recent Parquet Partitions</h2><p>Newest Bronze shards discovered on the local analytical lake.</p></div><span class="sp-badge">' + esc(state.catalog.parquet.format) + '</span></div><div class="sp-partitions" id="sp-partitions"></div></article><article class="sp-card"><div class="sp-card-head"><div><h2>Data Quality Scorecard</h2><p>Latest validation sample across critical telemetry contracts.</p></div><span class="sp-badge green">' + fmt(state.catalog.quality_average, 1) + '% healthy</span></div><div class="sp-quality" id="sp-quality"></div></article></section>' +
      '<section class="sp-card sp-viva"><div class="sp-viva-icon"><span class="material-symbols-outlined">school</span></div><div><h2>Academic Viva Reference: Lakehouse & Query Governance</h2><p>Bronze retains replayable source fidelity, Silver performs typed feature preparation, Parquet enables column pruning and compression, and the serving layer exposes safe low-latency views without permitting arbitrary execution.</p></div><button class="sp-btn" id="sp-viva-export">Export schema evidence</button></section>' +
      '</div>';
    renderLayers();
    renderCatalogDetails();
  }

  function renderLayers() {
    const labels = {
      raw: ["sensors", "Bronze Raw Events", "Append-only source telemetry"],
      zones: ["map", "Zone Registry", "Geospatial facility master"],
      silver: ["auto_awesome", "Silver ML Features", "Validated model features"],
      predictions: ["neurology", "Gold Predictions", "Random Forest inference"],
      dashboard: ["monitoring", "Serving Dashboard", "Operational aggregates"]
    };
    document.querySelector("#sp-layers").innerHTML = state.catalog.layers.map((layer) => {
      const meta = labels[layer.id] || ["dataset", layer.id, "Governed dataset"];
      return '<button class="sp-layer ' + (state.layer === layer.id ? "active" : "") + '" data-layer="' + esc(layer.id) + '"><div class="sp-layer-top"><span class="sp-layer-icon"><span class="material-symbols-outlined">' + meta[0] + '</span></span><span class="sp-layer-stat">' + fmt(layer.rows) + ' rows</span></div><h3>' + esc(meta[1]) + '</h3><p>' + esc(meta[2]) + ' · ' + fmt(layer.columns) + ' columns · ' + bytes(layer.bytes) + '</p></button>';
    }).join("");
    document.querySelectorAll("[data-layer]").forEach((button) => button.onclick = async () => {
      state.layer = button.dataset.layer;
      state.page = 1;
      state.search = "";
      document.querySelector("#sp-search").value = "";
      renderLayers();
      await loadData();
      toast("Loaded " + state.layer + " catalog layer");
    });
  }

  function renderCatalogDetails() {
    const partitions = state.catalog.recent_partitions || [];
    document.querySelector("#sp-partitions").innerHTML = partitions.length ? partitions.map((item) => '<div class="sp-partition"><b>' + esc(item.name) + '</b><span>' + bytes(item.bytes) + '</span><span>' + esc(new Date(item.updated_at).toLocaleString("en-IN")) + '</span></div>').join("") : '<div class="sp-empty">No Parquet partitions have been materialized yet.</div>';
    document.querySelector("#sp-quality").innerHTML = state.catalog.quality.map((item) => '<div class="sp-quality-row"><div class="sp-quality-head"><b>' + esc(item.name) + '</b><span>' + fmt(item.score, 2) + '%</span></div><div class="sp-bar"><i style="width:' + Math.max(0, Math.min(100, item.score)) + '%"></i></div><small>' + esc(item.detail) + '</small></div>').join("");
  }

  function renderData() {
    const d = state.data;
    const columns = d.schema.map((item) => item.name);
    document.querySelector("#sp-schema-title").textContent = state.layer.charAt(0).toUpperCase() + state.layer.slice(1) + " Schema";
    document.querySelector("#sp-schema-count").textContent = d.schema.length + " fields";
    document.querySelector("#sp-schema").innerHTML = d.schema.map((item) => '<div class="sp-field"><b>' + esc(item.name) + '</b><span>' + esc(item.type) + '</span><small>' + (item.nullable ? "Nullable values observed" : "Required / non-null in current dataset") + '</small></div>').join("");
    const output = document.querySelector("#sp-data-output");
    if (state.view === "json") {
      output.innerHTML = '<pre class="sp-json">' + esc(JSON.stringify(d.rows, null, 2)) + '</pre>';
    } else if (!d.rows.length) {
      output.innerHTML = '<div class="sp-empty">No records match the current filter.</div>';
    } else {
      output.innerHTML = '<div class="sp-table-wrap"><table class="sp-table"><thead><tr>' + columns.map((name) => '<th>' + esc(name) + '</th>').join("") + '</tr></thead><tbody>' + d.rows.map((row) => '<tr>' + columns.map((name) => '<td>' + esc(row[name]) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
    }
    const pages = Math.max(1, Math.ceil(d.total / state.limit));
    document.querySelector("#sp-page-meta").textContent = fmt(d.total) + " rows · Page " + d.page + " of " + pages;
    document.querySelector("#sp-prev").disabled = d.page <= 1;
    document.querySelector("#sp-next").disabled = d.page >= pages;
    document.querySelector("#sp-table-view").classList.toggle("active", state.view === "table");
    document.querySelector("#sp-json-view").classList.toggle("active", state.view === "json");
  }

  function renderQuery() {
    const q = state.query;
    document.querySelector("#sp-sql").textContent = q.sql;
    document.querySelector("#sp-query-meta").innerHTML = '<span class="sp-badge green">' + fmt(q.row_count) + ' rows returned</span><span class="sp-badge">' + fmt(q.execution_ms, 2) + ' ms</span><span class="sp-badge">' + fmt(q.partitions_scanned) + ' partition scanned</span>';
  }

  async function loadData() {
    state.data = await api("/api/data?layer=" + encodeURIComponent(state.layer) + "&page=" + state.page + "&limit=" + state.limit + "&q=" + encodeURIComponent(state.search));
    renderData();
  }

  async function runQuery(showToast) {
    const template = document.querySelector("#sp-template").value;
    const limit = document.querySelector("#sp-query-limit").value;
    const button = document.querySelector("#sp-run");
    button.disabled = true;
    button.textContent = "Executing...";
    try {
      state.query = await api("/api/query?template=" + encodeURIComponent(template) + "&limit=" + limit);
      renderQuery();
      if (showToast) toast("Query completed in " + fmt(state.query.execution_ms, 2) + " ms");
    } finally {
      button.disabled = false;
      button.textContent = "Execute query";
    }
  }

  function wireActions() {
    document.querySelector("#sp-sync").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Syncing...";
      try {
        const result = await api("/api/action/sync", { method: "POST", body: "{}" });
        state.catalog = await api("/api/catalog");
        renderLayers();
        renderCatalogDetails();
        await loadData();
        toast(result.message);
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
        button.textContent = "Sync metastore";
      }
    };
    document.querySelector("#sp-console-jump").onclick = () => {
      document.querySelector("#sp-console").scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector("#sp-template").focus();
    };
    document.querySelector("#sp-parquet").onclick = () => { download("/api/export?kind=" + encodeURIComponent(state.layer) + "&format=parquet"); toast("Parquet export prepared for " + state.layer); };
    document.querySelector("#sp-ddl").onclick = () => { download("/api/schema/ddl?layer=" + encodeURIComponent(state.layer)); toast("DDL schema prepared for " + state.layer); };
    document.querySelector("#sp-viva-export").onclick = () => { download("/api/schema/ddl?layer=" + encodeURIComponent(state.layer)); toast("Schema evidence downloaded"); };
    document.querySelector("#sp-run").onclick = () => runQuery(true).catch((error) => toast(error.message, true));
    let searchTimer;
    document.querySelector("#sp-search").oninput = (event) => {
      clearTimeout(searchTimer);
      state.search = event.target.value;
      state.page = 1;
      searchTimer = setTimeout(() => loadData().catch((error) => toast(error.message, true)), 280);
    };
    document.querySelector("#sp-table-view").onclick = () => { state.view = "table"; renderData(); };
    document.querySelector("#sp-json-view").onclick = () => { state.view = "json"; renderData(); };
    document.querySelector("#sp-prev").onclick = async () => { if (state.page > 1) { state.page -= 1; await loadData(); } };
    document.querySelector("#sp-next").onclick = async () => { state.page += 1; await loadData(); };
  }

  async function init() {
    try {
      installStyles();
      wireNavigation();
      const result = await Promise.all([
        api("/api/catalog"),
        api("/api/data?layer=raw&page=1&limit=10"),
        api("/api/query?template=capacity_pressure&limit=10"),
        api("/api/stream")
      ]);
      state.catalog = result[0];
      state.data = result[1];
      state.query = result[2];
      state.stream = result[3];
      buildPage();
      updateChrome();
      renderData();
      renderQuery();
      wireActions();
    } catch (error) {
      toast(error.message, true);
      const main = document.querySelector("main > div");
      if (main) main.innerHTML = '<div class="sp-page"><section class="sp-card"><h2>Data Explorer unavailable</h2><p>' + esc(error.message) + '</p></section></div>';
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
