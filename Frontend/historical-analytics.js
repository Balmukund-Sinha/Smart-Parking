(() => {
  "use strict";

  const ROUTES = {
    overview: "/overview", "live-monitoring": "/live-monitoring", "parking-map": "/parking-map",
    "historical-analytics": "/historical-analytics", "demand-prediction": "/demand-prediction",
    "big-data-pipeline": "/big-data-pipeline", "data-explorer": "/data-explorer", "system-health": "/system-health",
  };
  const COLORS = ["#38bdf8", "#34d399", "#2dd4bf", "#a78bfa", "#fbbf24"];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const state = { overview: null, health: null, history: null, days: 30, zones: [], resolution: "hourly", metric: "occupancy", loading: false };
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
  const byText = (selector, text, root = document) => [...root.querySelectorAll(selector)].find((node) => clean(node.textContent).includes(text));

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :root{--sp-canvas:#040810;--sp-shell:#070d18;--sp-card:#0c1524;--sp-card-high:#121e33;--sp-card-top:#182742;--sp-line:rgba(148,163,184,.16);--sp-text:#e2e8f0;--sp-muted:#94a3b8;--sp-faint:#64748b;--sp-cyan:#38bdf8;--sp-teal:#2dd4bf;--sp-green:#34d399;--sp-red:#f87171;--sp-amber:#fbbf24;--sp-purple:#a78bfa}
      html{font-size:19px!important;background:var(--sp-canvas)!important}body{line-height:1.5;background:var(--sp-canvas)!important;color:var(--sp-text)!important}.bg-background{background-color:var(--sp-canvas)!important}.bg-surface-container-low{background-color:var(--sp-shell)!important}.bg-surface-container-lowest{background-color:#03070d!important}.bg-surface-container{background-color:var(--sp-card)!important}.bg-surface-container-high{background-color:var(--sp-card-high)!important}.bg-surface-container-highest{background-color:var(--sp-card-top)!important}[class~="bg-surface-container-low/95"]{background-color:rgba(7,13,24,.96)!important}[class~="bg-surface-container-lowest/90"],[class~="bg-surface-container-lowest/80"],[class~="bg-surface-container-lowest/60"]{background-color:rgba(3,7,13,.9)!important}
      .text-on-surface{color:var(--sp-text)!important}.text-on-surface-variant{color:var(--sp-muted)!important}.text-outline{color:var(--sp-faint)!important}.text-primary{color:var(--sp-cyan)!important}.text-secondary{color:var(--sp-teal)!important}.text-tertiary{color:var(--sp-green)!important}.text-error{color:var(--sp-red)!important}.bg-primary{background-color:#0891b2!important}.bg-primary-container{background-color:#0e7490!important}.bg-secondary{background-color:var(--sp-teal)!important}.bg-tertiary{background-color:var(--sp-green)!important}.border-surface-variant,.border-outline-variant{border-color:var(--sp-line)!important}
      .text-\\[9px\\]{font-size:13px!important;line-height:1.4!important}.text-\\[10px\\]{font-size:13px!important;line-height:1.45!important}.text-\\[11px\\]{font-size:14px!important;line-height:1.45!important}button,input,select{min-height:38px;font-size:14px!important}
      aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}aside>div:first-child>div.h-16{height:64px!important;border-bottom-color:var(--sp-line)!important}aside nav a{min-height:46px;border:1px solid transparent;border-radius:8px!important}aside nav a[aria-current="page"]{background:rgba(8,145,178,.24)!important;color:#fff!important;border-color:rgba(34,211,238,.3)!important;box-shadow:none!important}aside[data-collapsed="true"]{transform:translateX(-100%)!important}aside[data-collapsed="true"]+div.pl-72{padding-left:0!important}aside[data-collapsed="true"]+div.pl-72>header{left:0!important}
      body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}
      #sp-history-controls,#sp-history-summary,.sp-history-card,#sp-history-viva{border:1px solid var(--sp-line)!important;box-shadow:0 14px 40px rgba(0,0,0,.16)!important}#sp-history-controls{background:var(--sp-shell)!important}#sp-history-summary{display:block!important;width:100%!important;grid-template-columns:none!important;background:transparent!important;border:0!important;box-shadow:none!important}.sp-range-active,.sp-metric-active{background:#0e7490!important;color:white!important;box-shadow:none!important}#exportDropdownBtn{color:#fff!important;background:linear-gradient(90deg,#0891b2,#14b8a6)!important;border:1px solid rgba(34,211,238,.45)!important}
      .sp-summary-grid{display:grid;width:100%;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.sp-summary-card{background:var(--sp-shell);border:1px solid var(--sp-line);border-radius:12px;padding:17px;min-width:0;min-height:142px}.sp-summary-label{display:flex;justify-content:space-between;gap:10px;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.06em}.sp-summary-label .material-symbols-outlined{font-size:21px;color:var(--sp-cyan)}.sp-summary-value{font-size:29px;font-weight:800;color:white;margin:12px 0 4px;letter-spacing:-.04em;white-space:nowrap}.sp-summary-note{color:var(--sp-muted);font-size:13px;line-height:1.4}.sp-summary-accent{color:var(--sp-green);font:700 12px "JetBrains Mono",monospace;margin-top:9px}
      .sp-history-card{background:var(--sp-shell)!important;border-radius:13px!important;padding:18px!important}.sp-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.sp-card-head h2{font-size:20px;line-height:1.2;color:white;margin:0}.sp-card-head p{font-size:14px;color:var(--sp-muted);margin:5px 0 0}.sp-card-badge{padding:5px 8px;border-radius:6px;background:var(--sp-card-top);color:var(--sp-cyan);font:700 12px "JetBrains Mono",monospace;white-space:nowrap}.sp-chart{height:350px;background:#050a13;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:12px;position:relative;overflow:hidden}.sp-chart svg{width:100%;height:100%;overflow:visible}.sp-gridline{stroke:#1e293b;stroke-width:1}.sp-axis{fill:#7c8ca3;font:12px "JetBrains Mono",monospace}.sp-chart-legend{display:flex;flex-wrap:wrap;gap:13px;margin-top:11px;color:var(--sp-muted);font-size:13px}.sp-chart-legend i{display:inline-block;width:16px;height:3px;border-radius:3px;margin-right:6px;vertical-align:middle}.sp-analytics-grid{display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(390px,.75fr)!important;gap:18px!important}.sp-analytics-grid>*{grid-column:auto!important}.sp-heatmap{display:grid;grid-template-columns:42px repeat(24,minmax(16px,1fr));gap:3px;overflow:auto;padding:5px}.sp-heat-cell{height:32px;min-width:17px;border-radius:3px;display:grid;place-items:center;color:transparent;font:10px "JetBrains Mono",monospace}.sp-heat-cell:hover{color:white;outline:1px solid rgba(255,255,255,.6);z-index:2}.sp-heat-label{display:grid;place-items:center;color:var(--sp-muted);font:11px "JetBrains Mono",monospace;min-width:28px}.sp-heat-hour{color:var(--sp-faint);font:10px "JetBrains Mono",monospace;text-align:center}.sp-note{margin-top:12px;padding:12px 14px;border-left:3px solid var(--sp-cyan);background:var(--sp-card);border-radius:0 8px 8px 0;color:var(--sp-muted);font-size:13px;line-height:1.5}.sp-note strong{color:white}.sp-dwell{height:270px;display:flex;align-items:flex-end;gap:9px;padding:18px 10px 34px;background:#050a13;border-radius:10px;border:1px solid rgba(255,255,255,.05)}.sp-dwell-bin{height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;min-width:42px}.sp-dwell-bin b{font:700 12px "JetBrains Mono",monospace;color:var(--sp-cyan)}.sp-dwell-bar{width:100%;max-width:60px;min-height:3px;background:linear-gradient(180deg,var(--sp-cyan),#0e7490);border-radius:6px 6px 2px 2px}.sp-dwell-bin span{font:11px "JetBrains Mono",monospace;color:var(--sp-muted);text-align:center}.sp-capacity-list{display:grid;gap:11px}.sp-cap-row{display:grid;gap:5px}.sp-cap-label{display:flex;justify-content:space-between;gap:12px;font-size:13px}.sp-cap-label b{color:white}.sp-cap-label span{font-family:"JetBrains Mono",monospace}.sp-cap-track{height:9px;background:var(--sp-card-top);border-radius:99px;overflow:hidden}.sp-cap-track i{display:block;height:100%;border-radius:99px}.sp-comparator{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.sp-zone-chip{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:999px;background:var(--sp-card-high);border:1px solid var(--sp-line);font-size:13px}.sp-zone-chip b{font-family:"JetBrains Mono",monospace;color:var(--sp-cyan)}.sp-zone-chip button{min-height:22px!important;width:22px;color:var(--sp-muted)}
      #sp-history-toasts{position:fixed;right:18px;bottom:18px;z-index:2000;display:grid;gap:8px;max-width:420px}.sp-toast{background:var(--sp-card-high);border:1px solid rgba(56,189,248,.35);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 13px/1.5 "JetBrains Mono",monospace}.sp-toast.error{border-color:rgba(248,113,113,.5);color:#fecaca}.sp-modal-backdrop{position:fixed;inset:0;z-index:1900;background:rgba(2,6,12,.78);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px}.sp-modal{width:min(580px,100%);background:var(--sp-card);border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:19px;color:var(--sp-text);box-shadow:0 24px 90px rgba(0,0,0,.65)}.sp-modal h2{font-size:20px;margin:0 0 8px}.sp-modal p{font-size:14px;line-height:1.6;color:var(--sp-muted)}.sp-modal select,.sp-modal input{width:100%;margin-top:10px;border:1px solid var(--sp-line);background:var(--sp-card-high);color:white;border-radius:8px;padding:9px}.sp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.sp-btn{border:1px solid var(--sp-line);background:var(--sp-card-high);color:var(--sp-text);border-radius:8px;padding:9px 12px;font-weight:700}.sp-btn.primary{background:#0891b2;border-color:#22d3ee;color:white}
      @media(max-width:1600px){html{font-size:18px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}.sp-summary-grid{grid-template-columns:repeat(3,1fr)}.sp-chart{height:320px}}
      @media(max-width:1180px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}.sp-analytics-grid{grid-template-columns:1fr!important}.sp-summary-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:680px){.sp-summary-grid{grid-template-columns:1fr}.sp-card-head{display:block}.sp-card-badge{display:inline-block;margin-top:8px}.sp-chart{height:280px}}
      aside nav a[aria-current="page"] span{color:#f8fafc!important}aside nav a[aria-current="page"] .material-symbols-outlined{color:#67e8f9!important}
      @media print{aside,body>div.pl-72>header,#sp-history-controls button,#sp-history-toasts{display:none!important}body>div.pl-72{padding-left:0!important}body>div.pl-72>main{padding-top:0!important}.sp-history-card,.sp-summary-card{break-inside:avoid}}
    `;
    document.head.appendChild(style);
    const stack = document.createElement("div"); stack.id = "sp-history-toasts"; document.body.appendChild(stack);
  }

  function toast(message, error = false) {
    const item = document.createElement("div"); item.className = `sp-toast${error ? " error" : ""}`; item.textContent = message;
    document.querySelector("#sp-history-toasts").appendChild(item); setTimeout(() => item.remove(), 4000);
  }

  function modal(title, body, actions = []) {
    const backdrop = document.createElement("div"); backdrop.className = "sp-modal-backdrop";
    backdrop.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="sp-modal-body">${body}</div><div class="sp-modal-actions"></div></section>`;
    const bar = backdrop.querySelector(".sp-modal-actions");
    [...actions, { label: "Close" }].forEach((action) => { const button = document.createElement("button"); button.type = "button"; button.className = `sp-btn${action.primary ? " primary" : ""}`; button.textContent = action.label; button.onclick = async () => { if (action.run) await action.run(backdrop); backdrop.remove(); }; bar.appendChild(button); });
    backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); }; document.body.appendChild(backdrop); return backdrop;
  }

  function download(url) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((anchor) => {
      const path = anchor.dataset.path; anchor.href = ROUTES[path] || "#"; const active = path === "historical-analytics";
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current"); anchor.classList.toggle("bg-primary-container", active); anchor.classList.toggle("text-on-primary-container", active); anchor.classList.toggle("font-semibold", active); anchor.classList.toggle("text-on-surface-variant", !active);
      if (!active) anchor.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("body > div.pl-72 > header span", "Executive Overview"); if (context) context.textContent = "Historical Analytics";
    const collapse = byText("aside span", "Collapse Dock")?.parentElement; if (collapse) collapse.onclick = () => { const aside = document.querySelector("aside"); aside.dataset.collapsed = String(aside.dataset.collapsed !== "true"); };
  }

  function wireGlobalControls() {
    const header = document.querySelector("body > div.pl-72 > header");
    const makeControl = (needle, label, openDialog) => {
      const text = byText("span", needle, header); const control = text?.parentElement;
      if (!control) return;
      text.textContent = label; control.setAttribute("role", "button"); control.setAttribute("tabindex", "0"); control.style.cursor = "pointer";
      control.setAttribute("aria-label", label); control.onclick = openDialog;
      control.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDialog(); } };
    };
    makeControl("All 20 Zones", `All ${state.overview.kpis.zones} Zones (Mumbai MMR)`, () => modal("Historical comparison scope", `<p>The lakehouse contains all ${fmt(state.overview.kpis.zones)} monitored zones. This page compares ${fmt(state.zones.length)} selected zones so the charts remain readable.</p>`, [{ label: "Reset to four zones", primary: true, run: () => { state.zones = state.overview.zones.slice(0, 4).map((zone) => zone.zone_id); renderComparators(); return loadHistory(); } }]));
    makeControl("Live Window", `History Window (${state.days} Days)`, () => modal("Historical window", "<p>Choose the analytical lookback. If the requested window exceeds available lakehouse history, the exact available coverage is shown on the page.</p>", [[7, "7 days"], [14, "14 days"], [30, "30 days"], [90, "Quarter"]].map(([days, label]) => ({ label, primary: days === state.days, run: () => { state.days = days; markRange(); return loadHistory(); } }))));
  }

  function updateLeaf(root, needle, value) { const node = [...root.querySelectorAll("span,p")].find((candidate) => candidate.children.length === 0 && clean(candidate.textContent).includes(needle)); if (node) node.textContent = value; return node; }

  function buildPanels() {
    const wrap = document.querySelector("main > div");
    const children = [...wrap.children];
    if (children.length < 6) throw new Error("Historical analytics layout is incomplete");
    children[0].id = "sp-history-controls";
    children[1].className = "w-full";
    children[1].id = "sp-history-summary";
    children[1].innerHTML = '<div class="sp-summary-grid" id="sp-summary-grid"></div>';
    children[2].className = "sp-history-card"; children[2].id = "sp-timeline-card";
    children[2].innerHTML = '<div class="sp-card-head"><div><h2 id="sp-timeline-title">Multi-Zone Occupancy Timeline</h2><p id="sp-timeline-subtitle">Filtered historical utilization across selected zones</p></div><span class="sp-card-badge" id="sp-timeline-badge">30-day horizon</span></div><div class="sp-chart" id="sp-timeline"></div><div class="sp-chart-legend" id="sp-timeline-legend"></div>';
    children[3].className = "sp-analytics-grid"; children[3].innerHTML = '<section class="sp-history-card"><div class="sp-card-head"><div><h2>Congestion by Day and Hour</h2><p>Average utilization across the selected zones</p></div><span class="sp-card-badge">7 × 24 matrix</span></div><div class="sp-heatmap" id="sp-heatmap"></div><div class="sp-note" id="sp-heat-note"></div></section><section class="sp-history-card"><div class="sp-card-head"><div><h2>Dwell Time Distribution</h2><p>Completed sessions grouped by duration</p></div><span class="sp-card-badge" id="sp-dwell-count">0 sessions</span></div><div class="sp-dwell" id="sp-dwell"></div><div class="sp-note" id="sp-dwell-note"></div></section>';
    children[4].className = "sp-analytics-grid"; children[4].innerHTML = '<section class="sp-history-card"><div class="sp-card-head"><div><h2>Weather vs Occupancy</h2><p>Rainfall and utilization relationship by hour</p></div><span class="sp-card-badge" id="sp-weather-badge">Live sample</span></div><div class="sp-chart" id="sp-weather"></div><div class="sp-note" id="sp-weather-note"></div></section><section class="sp-history-card"><div class="sp-card-head"><div><h2>Capacity vs Utilization</h2><p>Current pressure across monitored Mumbai zones</p></div><span class="sp-card-badge">Top 10</span></div><div class="sp-capacity-list" id="sp-capacity"></div><div class="sp-note" id="sp-capacity-note"></div></section>';
    children[5].id = "sp-history-viva";
    updateLeaf(children[0], "Parquet Delta Lakehouse", "Parquet Lakehouse");
    updateLeaf(children[0], "OLAP Engine:", "Serving: typed Pandas analytics · Spark-compatible partitions");
    updateLeaf(children[0], "Automated Report Exporter", "Export Analytics");
    const resolution = children[0].querySelector("select");
    if (resolution?.options[0]) resolution.options[0].textContent = "Hourly telemetry rollups";
    const dateText = [...children[0].querySelectorAll("span")].find((node) => /\w{3} \d{2}, \d{4}/.test(clean(node.textContent)));
    const rangeText = [...children[0].querySelectorAll("span")].find((node) => /Last \d+ Days/.test(clean(node.textContent)));
    if (dateText) dateText.id = "sp-history-date";
    if (rangeText) rangeText.id = "sp-history-range";
  }

  function wireVivaActions() {
    const viva = document.querySelector("#sp-history-viva");
    if (!viva) return;
    const specButton = byText("button", "View PySpark Job Spec", viva);
    const latexButton = byText("button", "Viva Brief LaTeX", viva);
    if (specButton) specButton.onclick = async () => {
      try {
        specButton.disabled = true;
        const zones = state.zones.join(",") || "ALL";
        const spec = await api(`/api/history/job-spec?days=${state.days}&zones=${encodeURIComponent(zones)}`);
        const stages = spec.stages.map((stage, index) => `<p><strong>${index + 1}. ${esc(stage.name)}</strong><br>${esc(stage.detail)}</p>`).join("");
        modal("PySpark Historical Analytics Job", `<p><strong>${esc(spec.engine)}</strong><br>${esc(spec.source)} → ${esc(spec.sink)}</p>${stages}<p><strong>Partitioning:</strong> ${esc(spec.partitioning.join(", "))}<br><strong>Selected zones:</strong> ${esc(spec.zones.join(", "))}<br><strong>Window:</strong> ${esc(spec.days)} days at ${esc(spec.rollup)}</p>`);
      } catch (error) { toast(error.message, true); }
      finally { specButton.disabled = false; }
    };
    if (latexButton) latexButton.onclick = () => {
      const zones = state.zones.join(",") || "ALL";
      download(`/api/history/export?days=${state.days}&zones=${encodeURIComponent(zones)}&format=tex`);
      toast("LaTeX viva brief prepared");
    };
  }

  function updateChrome() {
    const k = state.overview.kpis;
    updateLeaf(document.querySelector("body > div.pl-72 > header"), "All 20 Zones", `All ${k.zones} Zones (Mumbai MMR)`);
    const rate = byText("body > div.pl-72 > header span", "ev/s"); if (rate) rate.textContent = `${fmt(k.events_per_second, 2)} ev/s`;
    const clock = [...document.querySelectorAll("body > div.pl-72 > header span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent))); if (clock) clock.textContent = `${new Date(state.overview.updated_at || Date.now()).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST`;
    const side = byText("aside span", "OK"); if (side) side.textContent = state.health.kafka && state.health.spark ? "OK" : "DEGRADED";
    const alertButton = document.querySelector('header button[aria-label="Alerts"]');
    if (alertButton) alertButton.onclick = () => modal("Historical data status", `<p>${fmt(state.history?.summary.events)} filtered events · ${fmt(state.history?.trend.length)} trend observations<br>Kafka: ${state.health.kafka ? "healthy" : "offline"} · Spark: ${state.health.spark ? "running" : "offline"}</p>`);
  }

  function renderComparators() {
    const label = byText("#sp-history-controls span", "Active Comp Clust:");
    const row = label?.parentElement;
    if (!row) return;
    row.className = "sp-comparator";
    row.innerHTML = `<span style="color:var(--sp-muted);font:700 12px 'JetBrains Mono',monospace;text-transform:uppercase">Compared zones</span>${state.zones.map((id) => { const zone = state.overview.zones.find((item) => item.zone_id === id); return `<span class="sp-zone-chip"><b>${esc(id)}</b><span>${esc(zone?.zone_name || id)}</span><button type="button" aria-label="Remove ${esc(id)}" data-remove-zone="${esc(id)}">×</button></span>`; }).join("")}<button type="button" class="sp-btn" id="sp-add-zone">+ Compare zone</button>`;
    row.querySelectorAll("[data-remove-zone]").forEach((button) => button.onclick = () => { if (state.zones.length <= 1) return toast("Keep at least one comparison zone", true); state.zones = state.zones.filter((id) => id !== button.dataset.removeZone); renderComparators(); loadHistory(); });
    row.querySelector("#sp-add-zone").onclick = showZonePicker;
  }

  function showZonePicker() {
    const available = state.overview.zones.filter((zone) => !state.zones.includes(zone.zone_id));
    if (!available.length || state.zones.length >= 5) return toast("A maximum of five zones can be compared", true);
    modal("Add comparison zone", `<p>Select another Mumbai zone for all historical charts.</p><select id="sp-zone-picker">${available.map((zone) => `<option value="${esc(zone.zone_id)}">${esc(zone.zone_id)} · ${esc(zone.zone_name)}</option>`).join("")}</select>`, [{ label: "Add zone", primary: true, run: (dialog) => { state.zones.push(dialog.querySelector("#sp-zone-picker").value); renderComparators(); return loadHistory(); } }]);
  }

  function wireControls() {
    const panel = document.querySelector("#sp-history-controls");
    [["7D", 7], ["14D", 14], ["30D", 30], ["Quarter", 90]].forEach(([label, days]) => {
      const button = [...panel.querySelectorAll("button")].find((node) => clean(node.textContent) === label);
      if (button) button.onclick = () => { state.days = days; markRange(); loadHistory(); };
    });
    const custom = [...panel.querySelectorAll("button")].find((node) => clean(node.textContent) === "Custom");
    if (custom) custom.onclick = () => modal("Custom history window", '<p>Choose a window from 1 to 120 days.</p><input id="sp-custom-days" type="number" min="1" max="120" value="45">', [{ label: "Apply window", primary: true, run: (dialog) => { state.days = Math.min(120, Math.max(1, Number(dialog.querySelector("#sp-custom-days").value) || 30)); markRange(); return loadHistory(); } }]);
    const resolution = panel.querySelector("select"); if (resolution) resolution.onchange = () => { state.resolution = resolution.value; renderAll(); };
    const metrics = [["Occupancy %", "occupancy"], ["Inflow/Outflow Vol", "flow"], ["Turnover Rate", "turnover"], ["Revenue", "revenue"]];
    metrics.forEach(([needle, key]) => { const button = [...panel.querySelectorAll("button")].find((node) => clean(node.textContent).includes(needle)); if (button) button.onclick = () => { state.metric = key; metrics.forEach(([otherNeedle, otherKey]) => [...panel.querySelectorAll("button")].find((node) => clean(node.textContent).includes(otherNeedle))?.classList.toggle("sp-metric-active", otherKey === key)); renderTimeline(); }; });
    const sync = document.querySelector("#syncPartitionBtn"); if (sync) sync.onclick = async () => { try { sync.disabled = true; const result = await api("/api/action/sync", { method: "POST", body: "{}" }); toast(result.message); await loadHistory(); } catch (error) { toast(error.message, true); } finally { sync.disabled = false; } };
    const exportButton = document.querySelector("#exportDropdownBtn"), menu = document.querySelector("#exportMenu"); if (exportButton && menu) exportButton.onclick = () => menu.classList.toggle("hidden");
    const formats = [["Executive PDF", "pdf"], ["Tidy CSV", "csv"], ["Snappy Parquet", "parquet"], ["LaTeX Viva", "tex"]];
    formats.forEach(([needle, format]) => { const button = byText("#exportMenu button", needle); if (button) button.onclick = () => { menu.classList.add("hidden"); const zones = state.zones.join(",") || "ALL"; download(`/api/history/export?days=${state.days}&zones=${encodeURIComponent(zones)}&format=${format}`); toast(`${format.toUpperCase()} report prepared`); }; });
    markRange();
  }

  function markRange() {
    const panel = document.querySelector("#sp-history-controls");
    [["7D", 7], ["14D", 14], ["30D", 30], ["Quarter", 90]].forEach(([label, days]) => [...panel.querySelectorAll("button")].find((node) => clean(node.textContent) === label)?.classList.toggle("sp-range-active", state.days === days));
  }

  function renderSummary() {
    const s = state.history.summary;
    const rangeData = state.history.range || {}; const coverage = Number(rangeData.coverage_days ?? state.days);
    const cards = [
      ["dataset", "Filtered events", fmt(s.events), rangeData.truncated ? `${fmt(coverage, 1)} days available of ${state.days} requested` : `${fmt(coverage, 1)}-day analytical window`, `${fmt(state.history.trend.length)} hourly trend points`],
      ["speed", "Mean utilization", `${fmt(s.average_utilization, 1)}%`, "Across selected zones", s.average_utilization >= 85 ? "Critical pressure" : s.average_utilization >= 60 ? "Moderate pressure" : "Normal range"],
      ["timelapse", "Average dwell", `${fmt(s.average_dwell_minutes, 1)} min`, "Completed parking sessions", `${fmt(state.history.dwell.length)} sampled stays`],
      ["emergency_home", "Peak congestion", `${DAYS[s.peak_day_of_week] || "—"} ${String(s.peak_hour ?? 0).padStart(2, "0")}:00`, `${fmt(s.peak_utilization, 1)}% peak utilization`, "Highest filtered slot"],
      ["payments", "Estimated revenue", `₹${fmt(s.estimated_revenue_inr / 100000, 2)}L`, "Analytical estimate", `₹${fmt(state.history.assumptions.estimated_revenue_per_exit_inr)} per exit`],
    ];
    document.querySelector("#sp-summary-grid").innerHTML = cards.map(([icon, label, value, note, accent]) => `<section class="sp-summary-card"><div class="sp-summary-label"><span>${esc(label)}</span><span class="material-symbols-outlined">${icon}</span></div><div class="sp-summary-value">${esc(value)}</div><div class="sp-summary-note">${esc(note)}</div><div class="sp-summary-accent">${esc(accent)}</div></section>`).join("");
  }

  function bucketKey(value) {
    const date = new Date(value);
    if (state.resolution === "daily") return date.toISOString().slice(0, 10);
    if (state.resolution === "weekly") { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay()); return copy.toISOString().slice(0, 10); }
    return date.toISOString().slice(0, 13) + ":00";
  }

  function groupedSeries(rows, value, names) {
    return names.map((name, index) => {
      const buckets = new Map();
      rows.filter((row) => row.zone_id === name).forEach((row) => { const key = bucketKey(row.timestamp || row.bucket); const values = buckets.get(key) || []; values.push(Number(value(row) || 0)); buckets.set(key, values); });
      const points = [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ key, value: values.reduce((sum, item) => sum + item, 0) / values.length }));
      const maxPoints = state.resolution === "hourly" ? 720 : 120;
      const step = Math.max(1, Math.ceil(points.length / maxPoints));
      const sampled = points.filter((_, i) => i % step === 0);
      if (points.length && sampled.at(-1)?.key !== points.at(-1).key) sampled.push(points.at(-1));
      return { name, color: COLORS[index % COLORS.length], points: sampled };
    }).filter((series) => series.points.length);
  }

  function renderLineChart(element, series, suffix = "") {
    if (!series.length) { element.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:var(--sp-muted)">No observations match this selection.</div>'; return; }
    const width = 1000, height = 310, left = 58, right = 18, top = 18, bottom = 38;
    const values = series.flatMap((item) => item.points.map((point) => point.value)); const max = Math.max(...values, 1), min = Math.min(...values, 0); const span = max - min || 1; const maxLength = Math.max(...series.map((item) => item.points.length));
    const x = (index) => left + index / Math.max(1, maxLength - 1) * (width - left - right); const y = (value) => top + (max - value) / span * (height - top - bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
    for (let i = 0; i < 5; i++) { const yy = top + i * (height - top - bottom) / 4; const label = max - i * span / 4; svg += `<line class="sp-gridline" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text class="sp-axis" x="4" y="${yy + 4}">${fmt(label, 1)}${suffix}</text>`; }
    series.forEach((item) => { const points = item.points.map((point, index) => `${x(index)},${y(point.value)}`).join(" "); svg += `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" vector-effect="non-scaling-stroke"><title>${esc(item.name)}</title></polyline>`; });
    const first = series[0].points; if (first.length) svg += `<text class="sp-axis" x="${left}" y="${height - 8}">${esc(first[0].key.slice(0, 16))}</text><text class="sp-axis" text-anchor="end" x="${width - right}" y="${height - 8}">${esc(first.at(-1).key.slice(0, 16))}</text>`;
    element.innerHTML = svg + "</svg>";
  }

  function renderTimeline() {
    let series, suffix = "", title = "Multi-Zone Occupancy Timeline", subtitle = "Historical utilization across selected zones";
    if (state.metric === "occupancy") { series = groupedSeries(state.history.trend, (row) => row.utilization, state.zones); suffix = "%"; }
    else if (state.metric === "flow") {
      const rows = state.history.flow; const aggregate = (key) => { const buckets = new Map(); rows.forEach((row) => { const bucket = bucketKey(row.bucket); buckets.set(bucket, (buckets.get(bucket) || 0) + Number(row[key] || 0)); }); return { name: key === "ENTRY" ? "Inbound" : "Outbound", color: key === "ENTRY" ? "#34d399" : "#f87171", points: [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([keyName, value]) => ({ key: keyName, value })) }; }; series = [aggregate("ENTRY"), aggregate("EXIT")]; title = "Inflow and Outflow Volume"; subtitle = "Recorded ENTRY and EXIT events across the selected zones";
    } else if (state.metric === "turnover") { series = groupedSeries(state.history.flow, (row) => row.turnover_rate, state.zones); suffix = "%"; title = "Hourly Turnover Rate"; subtitle = "Entries plus exits as a percentage of zone capacity"; }
    else { series = groupedSeries(state.history.flow, (row) => Number(row.estimated_revenue_inr) / 100000, state.zones); suffix = "L"; title = "Estimated Revenue Trend"; subtitle = "Analytical estimate in ₹ lakhs using ₹60 per recorded exit"; }
    const coverage = Number(state.history.range?.coverage_days ?? state.days);
    document.querySelector("#sp-timeline-title").textContent = title; document.querySelector("#sp-timeline-subtitle").textContent = subtitle; document.querySelector("#sp-timeline-badge").textContent = `${fmt(coverage, 1)} days · ${state.resolution}${state.history.range?.truncated ? " · available data" : ""}`;
    renderLineChart(document.querySelector("#sp-timeline"), series, suffix);
    document.querySelector("#sp-timeline-legend").innerHTML = series.map((item) => `<span><i style="background:${item.color}"></i>${esc(state.overview.zones.find((zone) => zone.zone_id === item.name)?.zone_name || item.name)}</span>`).join("");
  }

  function renderHeatmap() {
    const grouped = new Map(); state.history.heatmap.forEach((row) => { const key = `${row.day_of_week}-${row.hour}`; const bucket = grouped.get(key) || []; bucket.push(Number(row.utilization || 0)); grouped.set(key, bucket); });
    let html = '<span></span>' + Array.from({ length: 24 }, (_, hour) => `<span class="sp-heat-hour">${hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>`).join("");
    let best = { value: -1, day: 0, hour: 0 };
    DAYS.forEach((day, dayIndex) => { html += `<span class="sp-heat-label">${day}</span>`; for (let hour = 0; hour < 24; hour++) { const values = grouped.get(`${dayIndex}-${hour}`) || []; const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0; if (value > best.value) best = { value, day: dayIndex, hour }; const hue = value >= 85 ? "248,113,113" : value >= 60 ? "56,189,248" : "52,211,153"; html += `<span class="sp-heat-cell" style="background:rgba(${hue},${Math.max(.12, value / 110)})" title="${day} ${String(hour).padStart(2, "0")}:00 · ${fmt(value, 1)}%">${fmt(value, 0)}</span>`; } });
    document.querySelector("#sp-heatmap").innerHTML = html; document.querySelector("#sp-heat-note").innerHTML = `<strong>Peak period:</strong> ${DAYS[best.day]} at ${String(best.hour).padStart(2, "0")}:00, averaging ${fmt(best.value, 1)}% utilization.`;
  }

  function renderDwell() {
    const durations = state.history.dwell.map((row) => Number(row.duration)).filter((value) => Number.isFinite(value) && value > 0); const bins = [0, 0, 0, 0, 0, 0, 0];
    durations.forEach((value) => { const index = value < 15 ? 0 : value < 30 ? 1 : value < 60 ? 2 : value < 120 ? 3 : value < 180 ? 4 : value < 240 ? 5 : 6; bins[index]++; });
    const labels = ["0-15m", "15-30m", "30-60m", "1-2h", "2-3h", "3-4h", "4h+"]; const max = Math.max(...bins, 1);
    document.querySelector("#sp-dwell").innerHTML = bins.map((count, index) => `<div class="sp-dwell-bin"><b>${fmt(count / Math.max(1, durations.length) * 100, 1)}%</b><div class="sp-dwell-bar" style="height:${Math.max(3, count / max * 100)}%" title="${fmt(count)} sessions"></div><span>${labels[index]}</span></div>`).join("");
    document.querySelector("#sp-dwell-count").textContent = `${fmt(durations.length)} sessions`; const sorted = [...durations].sort((a, b) => a - b); const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    document.querySelector("#sp-dwell-note").innerHTML = `<strong>Typical stay:</strong> median ${fmt(median, 0)} minutes; mean ${fmt(state.history.summary.average_dwell_minutes, 1)} minutes.`;
  }

  function renderWeather() {
    const rows = state.history.weather; const element = document.querySelector("#sp-weather"); if (!rows.length) return renderLineChart(element, []);
    const width = 700, height = 310, pad = 48; const rains = rows.map((row) => Number(row.rainfall || 0)), utils = rows.map((row) => Number(row.utilization || 0)); const maxRain = Math.max(...rains, 1), maxUtil = Math.max(...utils, 1);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
    for (let i = 0; i < 5; i++) { const y = pad + i * (height - pad * 2) / 4; svg += `<line class="sp-gridline" x1="${pad}" x2="${width - 18}" y1="${y}" y2="${y}"/><text class="sp-axis" x="3" y="${y + 4}">${fmt(maxUtil - i * maxUtil / 4, 0)}%</text>`; }
    rows.forEach((row) => { const x = pad + Number(row.rainfall || 0) / maxRain * (width - pad - 28), y = height - pad - Number(row.utilization || 0) / maxUtil * (height - pad * 2); svg += `<circle cx="${x}" cy="${y}" r="7" fill="#38bdf8" opacity=".8"><title>${String(row.hour).padStart(2, "0")}:00 · ${fmt(row.rainfall, 1)}mm · ${fmt(row.utilization, 1)}%</title></circle>`; });
    svg += `<text class="sp-axis" x="${pad}" y="${height - 10}">0 mm rainfall</text><text class="sp-axis" text-anchor="end" x="${width - 18}" y="${height - 10}">${fmt(maxRain, 1)} mm rainfall</text></svg>`; element.innerHTML = svg;
    const rainy = rows.filter((row) => Number(row.rainfall) > 0), dry = rows.filter((row) => Number(row.rainfall) === 0); const mean = (items) => items.length ? items.reduce((sum, row) => sum + Number(row.utilization || 0), 0) / items.length : 0; const delta = mean(rainy) - mean(dry);
    document.querySelector("#sp-weather-badge").textContent = `${fmt(rows.length)} hourly groups`; document.querySelector("#sp-weather-note").innerHTML = rainy.length ? `<strong>Rain relationship:</strong> rainy hours average ${Math.abs(delta).toFixed(1)} percentage points ${delta >= 0 ? "higher" : "lower"} utilization than dry hours.` : "<strong>Rain relationship:</strong> no rainfall was recorded in this filtered window.";
  }

  function renderCapacity() {
    const names = new Map(state.overview.zones.map((zone) => [zone.zone_id, zone.zone_name])); const rows = [...state.history.capacity].sort((a, b) => Number(b.utilization) - Number(a.utilization)).slice(0, 10);
    document.querySelector("#sp-capacity").innerHTML = rows.map((row) => { const value = Number(row.utilization); const color = value >= 85 ? "var(--sp-red)" : value >= 60 ? "var(--sp-cyan)" : "var(--sp-green)"; return `<div class="sp-cap-row"><div class="sp-cap-label"><b><span style="color:${color};font-family:'JetBrains Mono',monospace">${esc(row.zone_id)}</span> ${esc(names.get(row.zone_id) || row.zone_id)}</b><span style="color:${color}">${fmt(value, 1)}% · ${fmt(row.capacity)} bays</span></div><div class="sp-cap-track"><i style="width:${Math.min(100, value)}%;background:${color}"></i></div></div>`; }).join("");
    const high = rows.filter((row) => Number(row.utilization) >= 85).length; document.querySelector("#sp-capacity-note").innerHTML = `<strong>Current pressure:</strong> ${high} of the top ${rows.length} monitored zones are above the 85% critical threshold.`;
  }

  function renderViva() {
    const viva = document.querySelector("#sp-history-viva");
    const paragraph = viva?.querySelector("p");
    if (!paragraph) return;
    const coverage = Number(state.history.range?.coverage_days ?? state.days);
    paragraph.innerHTML = `This view requested ${fmt(state.days)} days and uses <strong>${fmt(coverage, 1)} days of available telemetry with ${fmt(state.history.summary.events)} filtered events</strong>. Typed hourly aggregations feed the multi-zone utilization, dwell, weather, flow, and capacity views; exports preserve the current ${fmt(state.zones.length)}-zone selection.`;
  }

  function updateRangeLabel() {
    const rangeData = state.history.range || {}; const dates = state.history.trend.map((row) => new Date(row.timestamp)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b); const start = rangeData.start ? new Date(rangeData.start) : dates[0], end = rangeData.end ? new Date(rangeData.end) : dates.at(-1); const panel = document.querySelector("#sp-history-controls");
    const coverage = Number(rangeData.coverage_days ?? state.days); const range = document.querySelector("#sp-history-range");
    if (range) range.textContent = rangeData.truncated ? `(${fmt(coverage, 1)} days available of ${state.days} requested)` : `(${fmt(coverage, 1)}-day window)`;
    const dateText = document.querySelector("#sp-history-date"); if (dateText && start && end) dateText.textContent = `${start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} - ${end.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
    const subtitle = panel.querySelector("h1 + p"); if (subtitle) subtitle.textContent = `Filtered Parquet lakehouse telemetry across ${state.zones.length} Mumbai zone${state.zones.length === 1 ? "" : "s"} (${fmt(coverage, 1)} days available${rangeData.truncated ? ` of ${state.days} requested` : ""})`;
    const headerRange = byText("body > div.pl-72 > header span", "History Window"); if (headerRange) headerRange.textContent = `History Window (${state.days} Days)`;
  }

  function renderAll() { renderSummary(); renderTimeline(); renderHeatmap(); renderDwell(); renderWeather(); renderCapacity(); renderViva(); updateRangeLabel(); }

  async function loadHistory() {
    if (state.loading) return; state.loading = true;
    try { state.history = await api(`/api/history?days=${state.days}&zones=${encodeURIComponent(state.zones.join(",") || "ALL")}`); renderAll(); document.body.dataset.smartparkHistory = "ready"; }
    catch (error) { toast(`Historical analytics unavailable: ${error.message}`, true); console.error(error); }
    finally { state.loading = false; }
  }

  async function boot() {
    installStyles(); wireNavigation(); buildPanels();
    try {
      [state.overview, state.health] = await Promise.all([api("/api/overview"), api("/api/health")]);
      state.zones = state.overview.zones.slice(0, 4).map((zone) => zone.zone_id);
      updateChrome(); renderComparators(); wireControls(); wireVivaActions(); wireGlobalControls(); await loadHistory();
    } catch (error) { toast(`Historical Analytics failed to initialize: ${error.message}`, true); console.error(error); }
  }

  boot();
})();
