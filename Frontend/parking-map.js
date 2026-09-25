(() => {
  "use strict";

  const ROUTES = {
    overview: "/overview", "live-monitoring": "/live-monitoring", "parking-map": "/parking-map",
    "historical-analytics": "/historical-analytics", "demand-prediction": "/demand-prediction",
    "big-data-pipeline": "/big-data-pipeline", "data-explorer": "/data-explorer", "system-health": "/system-health",
  };
  const state = {
    overview: null, health: null, mapData: null, prediction: null, selectedId: "", query: "",
    filter: "ALL", mode: "MAP", streetMode: "STREET", showHeat: true, showNodes: true, showRisk: true,
    map: null, baseLayer: null, markerLayer: null, poiLayer: null, heatLayer: null, riskLayer: null, markers: new Map(), timer: null,
  };
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
  const byText = (selector, text, root = document) => [...root.querySelectorAll(selector)].find((node) => clean(node.textContent).includes(text));
  const exactButton = (text, root = document) => [...root.querySelectorAll("button")].find((node) => clean(node.textContent) === text);

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :root{--sp-canvas:#040810;--sp-shell:#070d18;--sp-card:#0c1524;--sp-card-high:#121e33;--sp-card-top:#182742;--sp-line:rgba(148,163,184,.16);--sp-text:#e2e8f0;--sp-muted:#94a3b8;--sp-faint:#64748b;--sp-cyan:#38bdf8;--sp-teal:#2dd4bf;--sp-green:#34d399;--sp-red:#f87171;--sp-amber:#fbbf24}
      html{font-size:19px!important;background:var(--sp-canvas)!important}body{line-height:1.5;background:var(--sp-canvas)!important;color:var(--sp-text)!important}
      .bg-background{background-color:var(--sp-canvas)!important}.bg-surface-container-low{background-color:var(--sp-shell)!important}.bg-surface-container-lowest{background-color:#03070d!important}.bg-surface-container{background-color:var(--sp-card)!important}.bg-surface-container-high{background-color:var(--sp-card-high)!important}.bg-surface-container-highest{background-color:var(--sp-card-top)!important}
      [class~="bg-surface-container-low/95"]{background-color:rgba(7,13,24,.96)!important}[class~="bg-surface-container-lowest/90"],[class~="bg-surface-container-lowest/80"],[class~="bg-surface-container-lowest/60"]{background-color:rgba(3,7,13,.9)!important}[class~="bg-surface-container/90"],[class~="bg-surface-container/80"]{background-color:rgba(12,21,36,.9)!important}
      .text-on-surface{color:var(--sp-text)!important}.text-on-surface-variant{color:var(--sp-muted)!important}.text-outline{color:var(--sp-faint)!important}.text-primary{color:var(--sp-cyan)!important}.text-secondary{color:var(--sp-teal)!important}.text-tertiary{color:var(--sp-green)!important}.text-error{color:var(--sp-red)!important}
      .bg-primary{background-color:#0891b2!important}.bg-primary-container{background-color:#0e7490!important}.bg-secondary{background-color:var(--sp-teal)!important}.bg-tertiary{background-color:var(--sp-green)!important}.bg-error{background-color:var(--sp-red)!important}
      .border-surface-variant,.border-outline-variant{border-color:var(--sp-line)!important}
      .text-\\[9px\\]{font-size:13px!important;line-height:1.4!important}.text-\\[10px\\]{font-size:13px!important;line-height:1.45!important}.text-\\[11px\\]{font-size:14px!important;line-height:1.45!important}
      button,input,select{min-height:38px;font-size:14px!important}input::placeholder{opacity:.9}
      aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}aside>div:first-child>div.h-16{height:64px!important;border-bottom-color:var(--sp-line)!important}aside nav a{min-height:46px;border:1px solid transparent;border-radius:8px!important}aside nav a[aria-current="page"]{background:rgba(8,145,178,.24)!important;color:#fff!important;border-color:rgba(34,211,238,.3)!important;box-shadow:none!important}
      aside[data-collapsed="true"]{transform:translateX(-100%)!important}aside[data-collapsed="true"]+div.pl-72{padding-left:0!important}aside[data-collapsed="true"]+div.pl-72>header{left:0!important}
      body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}
      main header+div,main footer{border:1px solid var(--sp-line)!important}main header>div:last-child{border:1px solid var(--sp-line)!important}
      #sp-map-layout{display:grid!important;grid-template-columns:minmax(0,2fr) minmax(410px,1fr)!important;gap:18px!important}#sp-map-layout.sp-split{grid-template-columns:minmax(0,1.3fr) minmax(470px,1fr)!important}#sp-map-layout>.sp-map-shell,#sp-map-layout>.sp-map-drawer{grid-column:auto!important;width:auto!important}
      .sp-map-shell{height:760px!important;border:1px solid var(--sp-line);border-radius:14px!important;background:#03070d!important;position:relative;overflow:hidden}.sp-map-viewport{position:absolute;inset:0;background:#06101d}.sp-map-viewport[hidden]{display:none}.sp-map-fallback{width:100%;height:100%;border:0;filter:brightness(.65) saturate(.78) contrast(1.18)}
      #sp-parking-map{position:absolute;inset:0;z-index:1;background:#06101d}#sp-parking-map .leaflet-tile-pane{filter:brightness(.62) saturate(.76) contrast(1.2)}#sp-parking-map.satellite .leaflet-tile-pane{filter:brightness(.72) saturate(.82) contrast(1.12)}#sp-parking-map .leaflet-control-attribution{background:rgba(4,8,16,.88);color:#94a3b8;font:12px "JetBrains Mono",monospace}#sp-parking-map .leaflet-control-attribution a{color:#22d3ee}#sp-parking-map .leaflet-tooltip{background:#070d18;color:#e2e8f0;border:1px solid rgba(34,211,238,.4);box-shadow:0 8px 28px rgba(0,0,0,.55);font:13px/1.5 "JetBrains Mono",monospace}#sp-parking-map .leaflet-tooltip:before{border-top-color:#22d3ee}
      .sp-marker-shell{background:transparent!important;border:0!important}.sp-map-pin{height:36px;min-width:118px;padding:0 10px;border-radius:7px;background:rgba(7,13,24,.96);display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid currentColor;box-shadow:0 7px 22px rgba(0,0,0,.64);font:700 13px "JetBrains Mono",monospace;white-space:nowrap;transition:transform .16s,box-shadow .16s}.sp-map-pin:hover,.sp-map-pin.selected{transform:scale(1.12);box-shadow:0 0 0 3px rgba(34,211,238,.26),0 9px 28px rgba(0,0,0,.7);z-index:10}.sp-map-pin.low{color:var(--sp-green)}.sp-map-pin.medium{color:var(--sp-cyan)}.sp-map-pin.high{color:var(--sp-red);background:rgba(69,10,10,.96)}.sp-map-pin i{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}
      .sp-map-overlay{position:absolute;z-index:500;background:rgba(7,13,24,.92);border:1px solid rgba(148,163,184,.2);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.4)}.sp-map-coords{top:16px;left:16px;padding:9px 12px;border-radius:9px;color:var(--sp-text);font:600 13px "JetBrains Mono",monospace}.sp-map-tools{top:16px;right:16px;padding:5px;border-radius:10px;display:grid;gap:4px}.sp-map-tools button{width:42px;height:42px;min-height:42px;border-radius:7px;color:var(--sp-text);display:grid;place-items:center}.sp-map-tools button:hover{background:var(--sp-card-high)}.sp-map-legend{left:16px;bottom:16px;padding:10px 13px;border-radius:9px;display:flex;gap:14px;color:var(--sp-muted);font:600 13px "JetBrains Mono",monospace}.sp-map-legend b{font-weight:700}.sp-map-status{right:16px;bottom:16px;padding:9px 12px;border-radius:9px;color:var(--sp-muted);font:600 12px "JetBrains Mono",monospace}
      .sp-zone-grid{position:absolute;inset:0;z-index:550;background:#050a13;padding:18px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;align-content:start}.sp-zone-grid[hidden]{display:none}.sp-zone-tile{border:1px solid var(--sp-line);background:var(--sp-card);border-radius:10px;padding:14px;text-align:left;color:var(--sp-text)}.sp-zone-tile:hover,.sp-zone-tile.active{border-color:rgba(34,211,238,.55);background:var(--sp-card-high)}.sp-zone-tile strong{display:block;font-size:15px}.sp-zone-tile span{display:block;color:var(--sp-muted);font:13px/1.55 "JetBrains Mono",monospace;margin-top:4px}
      .sp-map-drawer{display:flex!important;flex-direction:column;gap:12px}.sp-drawer-card{border:1px solid var(--sp-line);background:var(--sp-card);border-radius:14px;padding:18px;box-shadow:0 14px 40px rgba(0,0,0,.18)}.sp-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sp-zone-code{color:var(--sp-cyan);font:700 14px "JetBrains Mono",monospace;letter-spacing:.06em}.sp-drawer-head h2{font-size:24px;line-height:1.15;margin:5px 0 6px;color:white}.sp-location{color:var(--sp-muted);font-size:14px;line-height:1.45}.sp-risk{border-radius:999px;padding:6px 9px;font:700 12px "JetBrains Mono",monospace;white-space:nowrap}.sp-risk.low{background:rgba(52,211,153,.13);color:var(--sp-green)}.sp-risk.medium{background:rgba(56,189,248,.13);color:var(--sp-cyan)}.sp-risk.high{background:rgba(248,113,113,.14);color:var(--sp-red)}
      .sp-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0}.sp-metric{background:var(--sp-shell);border:1px solid rgba(255,255,255,.06);border-radius:9px;padding:11px}.sp-metric label{display:block;color:var(--sp-faint);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase}.sp-metric strong{display:block;color:white;font-size:24px;margin-top:5px}.sp-metric span{color:var(--sp-muted);font-size:12px}.sp-progress{height:9px;border-radius:999px;background:var(--sp-card-top);overflow:hidden;margin:8px 0}.sp-progress i{display:block;height:100%;border-radius:999px}.sp-section-title{display:flex;align-items:center;justify-content:space-between;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.05em}.sp-forecast{margin-top:13px;padding:13px;background:var(--sp-shell);border:1px solid rgba(255,255,255,.06);border-radius:10px}.sp-forecast-main{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:7px}.sp-forecast-main strong{font-size:19px;color:white}.sp-forecast-main span{font:700 13px "JetBrains Mono",monospace}.sp-alt-list{display:grid;gap:8px;margin-top:9px}.sp-alt{width:100%;display:flex;justify-content:space-between;gap:10px;padding:10px;background:var(--sp-shell);border:1px solid rgba(255,255,255,.06);border-radius:8px;text-align:left;color:var(--sp-text)}.sp-alt:hover{border-color:rgba(45,212,191,.4)}.sp-alt b{display:block;font-size:14px}.sp-alt small{display:block;color:var(--sp-muted);font-size:12px;margin-top:3px}.sp-alt strong{color:var(--sp-green);font:700 14px "JetBrains Mono",monospace}.sp-drawer-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}.sp-btn{border:1px solid var(--sp-line);background:var(--sp-card-high);color:var(--sp-text);border-radius:8px;padding:10px 12px;font-weight:700}.sp-btn:hover{border-color:rgba(56,189,248,.5)}.sp-btn.primary{background:#0891b2;border-color:#22d3ee;color:white}.sp-btn:disabled{opacity:.55;cursor:not-allowed}.sp-drawer-links{display:flex;justify-content:space-between;gap:10px;margin-top:12px}.sp-drawer-links button,.sp-drawer-links a{color:var(--sp-muted);font-size:13px;text-decoration:none}.sp-drawer-links button:hover,.sp-drawer-links a:hover{color:var(--sp-cyan)}
      .sp-live-input{margin-top:13px;padding:13px;border:1px solid rgba(45,212,191,.25);border-radius:10px;background:rgba(45,212,191,.055)}.sp-source-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.sp-source-badge{padding:4px 7px;border-radius:999px;background:rgba(45,212,191,.12);color:var(--sp-green);font:700 11px "JetBrains Mono",monospace}.sp-live-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.sp-live-set{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8px}.sp-live-set input{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--sp-line);border-radius:8px;background:var(--sp-shell);color:var(--sp-text)}.sp-source-note{margin-top:8px;color:var(--sp-muted);font-size:12px;line-height:1.5}.sp-source-note strong{color:var(--sp-cyan)}
      #sp-map-toasts{position:fixed;right:18px;bottom:18px;z-index:2000;display:grid;gap:8px;max-width:420px}.sp-toast{background:var(--sp-card-high);border:1px solid rgba(56,189,248,.35);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 13px/1.5 "JetBrains Mono",monospace}.sp-toast.error{border-color:rgba(248,113,113,.5);color:#fecaca}
      .sp-modal-backdrop{position:fixed;inset:0;z-index:1900;background:rgba(2,6,12,.78);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px}.sp-modal{width:min(580px,100%);background:var(--sp-card);border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:19px;color:var(--sp-text);box-shadow:0 24px 90px rgba(0,0,0,.65)}.sp-modal h2{font-size:20px;margin:0 0 8px}.sp-modal p{font-size:14px;line-height:1.65;color:var(--sp-muted)}.sp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      @media(max-width:1600px){html{font-size:18px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}.sp-map-shell{height:700px!important}#sp-map-layout{grid-template-columns:minmax(0,1.75fr) minmax(380px,1fr)!important}}
      @media(max-width:1180px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}#sp-map-layout,#sp-map-layout.sp-split{grid-template-columns:1fr!important}.sp-map-shell{height:650px!important}.sp-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:700px){.sp-map-shell{height:560px!important}.sp-map-legend{flex-wrap:wrap;right:16px}.sp-map-status{display:none}.sp-metrics{grid-template-columns:1fr 1fr}.sp-drawer-head{display:block}.sp-risk{display:inline-block;margin-top:8px}}
      aside nav a[aria-current="page"] span{color:#f8fafc!important}aside nav a[aria-current="page"] .material-symbols-outlined{color:#67e8f9!important}
    `;
    document.head.appendChild(style);
    const stack = document.createElement("div");
    stack.id = "sp-map-toasts";
    document.body.appendChild(stack);
  }

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `sp-toast${error ? " error" : ""}`;
    item.textContent = message;
    document.querySelector("#sp-map-toasts").appendChild(item);
    setTimeout(() => item.remove(), 4000);
  }

  function modal(title, body, actions = []) {
    const backdrop = document.createElement("div");
    backdrop.className = "sp-modal-backdrop";
    backdrop.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${body}</p><div class="sp-modal-actions"></div></section>`;
    const bar = backdrop.querySelector(".sp-modal-actions");
    [...actions, { label: "Close" }].forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sp-btn${action.primary ? " primary" : ""}`;
      button.textContent = action.label;
      button.onclick = async () => { backdrop.remove(); if (action.run) await action.run(); };
      bar.appendChild(button);
    });
    backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); };
    document.body.appendChild(backdrop);
  }

  function download(url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function riskClass(zone) {
    return Number(zone.utilization) >= 85 ? "high" : Number(zone.utilization) >= 60 ? "medium" : "low";
  }

  function riskLabel(zone) {
    return riskClass(zone) === "high" ? "CRITICAL" : riskClass(zone) === "medium" ? "MODERATE" : "NORMAL";
  }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((anchor) => {
      const path = anchor.dataset.path;
      anchor.href = ROUTES[path] || "#";
      const active = path === "parking-map";
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current");
      anchor.classList.toggle("bg-primary-container", active);
      anchor.classList.toggle("text-on-primary-container", active);
      anchor.classList.toggle("font-semibold", active);
      anchor.classList.toggle("text-on-surface-variant", !active);
      if (!active) anchor.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("body > div.pl-72 > header span", "Executive Overview");
    if (context) context.textContent = "Geospatial Operations";
    const collapse = byText("aside span", "Collapse Dock")?.parentElement;
    if (collapse) collapse.onclick = () => {
      const aside = document.querySelector("aside");
      aside.dataset.collapsed = String(aside.dataset.collapsed !== "true");
      toast(aside.dataset.collapsed === "true" ? "Navigation dock collapsed" : "Navigation dock restored");
    };
  }

  function updateLeaf(root, needle, value) {
    const node = [...root.querySelectorAll("span,p")].find((candidate) => candidate.children.length === 0 && clean(candidate.textContent).includes(needle));
    if (node) node.textContent = value;
    return node;
  }

  function updateChrome() {
    const k = state.overview.kpis;
    const operational = Boolean(state.health.kafka && state.health.spark && state.health.postgres);
    const hybridAvailable = Boolean(state.mapData?.hybrid?.sources?.occupancy?.available);
    updateLeaf(document.querySelector("body > div.pl-72 > header"), "All 20 Zones", `All ${k.zones} Zones (Mumbai MMR)`);
    const live = byText("body > div.pl-72 > header span", "ev/s");
    if (live) live.textContent = `${fmt(state.health.kafka ? k.events_per_second : 0, 2)} ev/s`;
    const status = byText("body > div.pl-72 > header span", "LIVE") || byText("body > div.pl-72 > header span", "DEGRADED");
    if (status) { status.textContent = operational ? "LIVE" : hybridAvailable ? "HYBRID" : "DEGRADED"; status.style.color = operational || hybridAvailable ? "var(--sp-green)" : "var(--sp-red)"; const dot = status.previousElementSibling; if (dot) dot.style.background = operational || hybridAvailable ? "var(--sp-green)" : "var(--sp-red)"; }
    const clock = [...document.querySelectorAll("body > div.pl-72 > header span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent)));
    if (clock) clock.textContent = `${new Date(state.overview.updated_at || Date.now()).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST`;
    updateLeaf(document.querySelector("main"), "Zones Synced", `${k.zones} Zones Loaded`);
    updateLeaf(document.querySelector("main"), "Zones Loaded", `${k.zones} Zones Loaded`);
    const kafkaSync = updateLeaf(document.querySelector("main"), "Kafka Sync:", `Kafka Sync: ${state.health.kafka ? "healthy" : "offline"}`);
    if (kafkaSync) { kafkaSync.style.color = state.health.kafka ? "var(--sp-green)" : "var(--sp-red)"; const dot = kafkaSync.previousElementSibling; if (dot) { dot.style.setProperty("background", state.health.kafka ? "var(--sp-green)" : "var(--sp-red)", "important"); dot.querySelectorAll("span").forEach((item) => { item.style.setProperty("background", state.health.kafka ? "var(--sp-green)" : "var(--sp-red)", "important"); item.classList.toggle("animate-ping", Boolean(state.health.kafka)); }); } }
    const sideStatus = byText("aside span", "OK") || byText("aside span", "DEGRADED");
    if (sideStatus) { sideStatus.textContent = operational ? "OK" : hybridAvailable ? "HYBRID" : "DEGRADED"; sideStatus.style.color = operational || hybridAvailable ? "var(--sp-green)" : "var(--sp-red)"; }
    const alertButton = document.querySelector('header button[aria-label="Alerts"]');
    const alerts = state.overview.zones.filter((zone) => Number(zone.utilization) >= 85);
    if (alertButton) {
      const badge = alertButton.querySelector("span.absolute");
      if (badge) badge.textContent = alerts.length;
      alertButton.onclick = () => modal(`Capacity alerts (${alerts.length})`, alerts.length ? alerts.map((zone) => `${esc(zone.zone_id)} - ${esc(zone.zone_name)}: ${fmt(zone.utilization, 1)}% utilized`).join("<br>") : "No zone is currently above the critical threshold.");
    }
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!document.querySelector('link[data-sp-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.spLeaflet = "true";
      document.head.appendChild(link);
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-sp-leaflet]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.L), { once: true });
        existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.dataset.spLeaflet = "true";
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("Leaflet failed to load"));
      document.head.appendChild(script);
      setTimeout(() => { if (!window.L) reject(new Error("Leaflet load timed out")); }, 9000);
    });
  }

  function buildWorkspace() {
    const shell = document.querySelector(".h-\\[740px\\]");
    if (!shell) throw new Error("Parking map canvas was not found");
    const layout = shell.parentElement;
    layout.id = "sp-map-layout";
    shell.classList.add("sp-map-shell");
    const drawer = [...layout.children].find((node) => node !== shell);
    drawer.classList.add("sp-map-drawer");
    shell.innerHTML = `
      <div class="sp-map-viewport" id="sp-map-viewport"><div id="sp-parking-map" aria-label="Interactive street map of Mumbai parking zones"></div></div>
      <div class="sp-zone-grid" id="sp-zone-grid" hidden></div>
      <div class="sp-map-overlay sp-map-coords"><span class="material-symbols-outlined" style="font-size:17px;color:var(--sp-cyan);vertical-align:middle">my_location</span> <span id="sp-map-coords">19.0760 N, 72.8777 E</span></div>
      <div class="sp-map-overlay sp-map-tools"><button id="sp-zoom-in" aria-label="Zoom in" type="button"><span class="material-symbols-outlined">add</span></button><button id="sp-zoom-out" aria-label="Zoom out" type="button"><span class="material-symbols-outlined">remove</span></button><button id="sp-reset" aria-label="Reset map" type="button"><span class="material-symbols-outlined">explore</span></button><button id="sp-fullscreen" aria-label="Fullscreen map" type="button"><span class="material-symbols-outlined">fullscreen</span></button></div>
      <div class="sp-map-overlay sp-map-legend"><b style="color:var(--sp-green)">● Normal &lt;60%</b><b style="color:var(--sp-cyan)">● Moderate 60-84%</b><b style="color:var(--sp-red)">● Critical ≥85%</b></div>
      <div class="sp-map-overlay sp-map-status" id="sp-map-status">20 stored zones</div>`;
    drawer.innerHTML = '<div class="sp-drawer-card" id="sp-zone-detail"><div style="padding:40px;text-align:center;color:var(--sp-muted)">Loading zone telemetry...</div></div>';
    document.querySelector("#sp-zoom-in").onclick = () => state.map?.zoomIn();
    document.querySelector("#sp-zoom-out").onclick = () => state.map?.zoomOut();
    document.querySelector("#sp-reset").onclick = resetMap;
    document.querySelector("#sp-fullscreen").onclick = () => shell.requestFullscreen?.().catch(() => toast("Fullscreen is unavailable in this browser", true));
  }

  function filteredZones() {
    return state.overview.zones.filter((zone) => {
      const text = `${zone.zone_id} ${zone.zone_name}`.toLowerCase();
      const queryMatch = text.includes(state.query.toLowerCase());
      const filterMatch = state.filter === "ALL" ||
        (state.filter === "VACANCY" && Number(zone.available) > 40) ||
        (state.filter === "MODERATE" && Number(zone.available) >= 10 && Number(zone.available) <= 40) ||
        (state.filter === "CRITICAL" && Number(zone.utilization) >= 85);
      return queryMatch && filterMatch;
    });
  }

  function markerIcon(zone) {
    const selected = zone.zone_id === state.selectedId;
    return L.divIcon({
      className: "sp-marker-shell",
      html: `<div class="sp-map-pin ${riskClass(zone)}${selected ? " selected" : ""}"><i></i><span>${esc(zone.zone_id)} ${fmt(zone.utilization, 0)}%</span></div>`,
      iconSize: [124, 36], iconAnchor: [62, 18],
    });
  }

  function useBaseLayer(mode) {
    if (!state.map) return;
    if (state.baseLayer) state.map.removeLayer(state.baseLayer);
    const satellite = mode === "SATELLITE";
    document.querySelector("#sp-parking-map")?.classList.toggle("satellite", satellite);
    state.baseLayer = L.tileLayer(
      satellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: satellite ? "Tiles © Esri" : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }
    ).addTo(state.map);
  }

  function createMap() {
    state.map = L.map("sp-parking-map", { zoomControl: false, minZoom: 10, maxZoom: 18, preferCanvas: true });
    useBaseLayer("STREET");
    state.markerLayer = L.layerGroup().addTo(state.map);
    state.poiLayer = L.layerGroup().addTo(state.map);
    state.heatLayer = L.layerGroup().addTo(state.map);
    state.riskLayer = L.layerGroup().addTo(state.map);
    state.map.on("moveend", () => {
      const center = state.map.getCenter();
      const label = document.querySelector("#sp-map-coords");
      if (label) label.textContent = `${center.lat.toFixed(4)} N, ${center.lng.toFixed(4)} E`;
    });
    resetMap();
    renderMapLayers();
    setTimeout(() => state.map?.invalidateSize(), 0);
  }

  function fallbackMap() {
    const zones = state.overview.zones;
    const lats = zones.map((zone) => Number(zone.latitude));
    const lons = zones.map((zone) => Number(zone.longitude));
    const bounds = `${Math.min(...lons) - .015},${Math.min(...lats) - .015},${Math.max(...lons) + .015},${Math.max(...lats) + .015}`;
    document.querySelector("#sp-map-viewport").innerHTML = `<iframe class="sp-map-fallback" title="OpenStreetMap view of Mumbai parking zones" src="https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik"></iframe>`;
    toast("Interactive map controls could not load; showing the real OpenStreetMap fallback.", true);
  }

  function resetMap() {
    if (!state.map) return;
    const points = state.overview.zones.map((zone) => [Number(zone.latitude), Number(zone.longitude)]).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    if (points.length) state.map.fitBounds(points, { padding: [62, 62], maxZoom: 13 });
  }

  function renderMapLayers() {
    renderGrid();
    const zones = filteredZones();
    const status = document.querySelector("#sp-map-status");
    if (status) status.textContent = `${zones.length} visible zone${zones.length === 1 ? "" : "s"} · ${state.health.kafka ? "live telemetry" : "stored snapshot"}`;
    if (!state.map) return;
    state.markerLayer.clearLayers();
    state.poiLayer?.clearLayers();
    state.heatLayer.clearLayers();
    state.riskLayer.clearLayers();
    state.markers.clear();
    zones.forEach((zone) => {
      const point = [Number(zone.latitude), Number(zone.longitude)];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      const klass = riskClass(zone);
      const color = klass === "high" ? "#f87171" : klass === "medium" ? "#38bdf8" : "#34d399";
      if (state.showHeat) L.circle(point, { radius: 190 + Number(zone.utilization) * 5, stroke: false, fillColor: color, fillOpacity: .12, interactive: false }).addTo(state.heatLayer);
      if (state.showRisk) L.circle(point, { radius: 110, color, weight: 1, opacity: .55, dashArray: "4 5", fill: false, interactive: false }).addTo(state.riskLayer);
      if (state.showNodes) {
        const marker = L.marker(point, { icon: markerIcon(zone), title: `${zone.zone_id} - ${zone.zone_name}`, keyboard: true, riseOnHover: true }).addTo(state.markerLayer);
        marker.bindTooltip(`<strong>${esc(zone.zone_name)}</strong><br>${esc(zone.zone_id)} · ${point[0].toFixed(6)}, ${point[1].toFixed(6)}<br>${fmt(zone.available)} of ${fmt(zone.capacity)} bays available`, { direction: "top", offset: [0, -18] });
        marker.on("click", () => selectZone(zone.zone_id));
        state.markers.set(zone.zone_id, marker);
      }
    });
    (state.mapData?.external_parking || []).forEach((place) => {
      const point = [Number(place.latitude), Number(place.longitude)];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      L.circleMarker(point, { radius: 5, color: "#fbbf24", weight: 1.5, fillColor: "#fbbf24", fillOpacity: .55 })
        .bindTooltip(`<strong>${esc(place.name)}</strong><br>OpenStreetMap facility · occupancy not published${place.capacity ? `<br>Mapped capacity: ${fmt(place.capacity)}` : ""}`, { direction: "top" })
        .addTo(state.poiLayer);
    });
  }

  function renderGrid() {
    const grid = document.querySelector("#sp-zone-grid");
    const viewport = document.querySelector("#sp-map-viewport");
    const visible = state.mode === "GRID";
    grid.hidden = !visible;
    viewport.hidden = visible;
    if (!visible) { setTimeout(() => state.map?.invalidateSize(), 0); return; }
    grid.innerHTML = filteredZones().map((zone) => `<button type="button" class="sp-zone-tile${zone.zone_id === state.selectedId ? " active" : ""}" data-grid-zone="${esc(zone.zone_id)}"><strong><span style="color:var(--sp-cyan);display:inline">${esc(zone.zone_id)}</span> ${esc(zone.zone_name)}</strong><span>${fmt(zone.available)} bays available · ${fmt(zone.utilization, 1)}% utilized</span><span style="color:${riskClass(zone) === "high" ? "var(--sp-red)" : riskClass(zone) === "medium" ? "var(--sp-cyan)" : "var(--sp-green)"}">${riskLabel(zone)} LOAD</span></button>`).join("") || '<div style="color:var(--sp-muted);padding:30px">No zones match the current filters.</div>';
    grid.querySelectorAll("[data-grid-zone]").forEach((button) => button.onclick = () => selectZone(button.dataset.gridZone, false));
  }

  function latestForecast(zone) {
    return Number(zone.forecast_occupancy_30m ?? zone.occupancy);
  }

  function renderDrawer() {
    const zone = state.mapData.selected;
    if (!zone) return;
    const prediction = latestForecast(zone);
    const forecastPct = Number(zone.capacity) ? prediction / Number(zone.capacity) * 100 : 0;
    const klass = riskClass(zone);
    const fill = klass === "high" ? "var(--sp-red)" : klass === "medium" ? "var(--sp-cyan)" : "var(--sp-green)";
    const alternatives = state.mapData.alternatives.slice(0, 3);
    const weather = state.overview.weather || {};
    const source = zone.telemetry_source || "STORED_SNAPSHOT";
    const forecastEngine = state.overview.forecast_engine || "Forecast unavailable";
    const observed = zone.telemetry_updated_at ? new Date(zone.telemetry_updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "stored dataset";
    document.querySelector("#sp-zone-detail").innerHTML = `
      <div class="sp-drawer-head"><div><div class="sp-zone-code">${esc(zone.zone_id)} · ${esc(source.replaceAll("_", " "))}</div><h2>${esc(zone.zone_name)}</h2><div class="sp-location">${Number(zone.latitude).toFixed(6)}, ${Number(zone.longitude).toFixed(6)} · Mumbai, Maharashtra</div></div><span class="sp-risk ${klass}">${riskLabel(zone)} · ${fmt(zone.utilization, 1)}%</span></div>
      <div class="sp-metrics"><div class="sp-metric"><label>Occupied</label><strong>${fmt(zone.occupancy)}</strong><span>of ${fmt(zone.capacity)} bays</span></div><div class="sp-metric"><label>Available</label><strong style="color:${fill}">${fmt(zone.available)}</strong><span>${fmt(100 - Number(zone.utilization), 1)}% free</span></div><div class="sp-metric"><label>Mean dwell</label><strong>${fmt(zone.mean_duration_min, 0)}m</strong><span>historical</span></div></div>
      <div class="sp-live-input"><div class="sp-source-row"><div class="sp-section-title"><span>Live occupancy observation</span></div><span class="sp-source-badge">${esc(source)}</span></div><div class="sp-live-buttons"><button class="sp-btn" id="sp-live-exit" type="button">− Vehicle exit</button><button class="sp-btn primary" id="sp-live-entry" type="button">+ Vehicle entry</button></div><div class="sp-live-set"><input id="sp-live-value" type="number" min="0" max="${fmt(zone.capacity)}" value="${fmt(zone.occupancy)}" aria-label="Set occupied bay count"><button class="sp-btn" id="sp-live-set" type="button">Set occupancy</button></div><div class="sp-source-note">Observed: ${esc(observed)}<br><strong>${weather.available ? "Open-Meteo live" : "Stored weather fallback"}</strong>: ${weather.temperature == null ? "--" : fmt(weather.temperature, 1) + "°C"}, rain ${weather.rainfall == null ? "--" : fmt(weather.rainfall, 1) + " mm"}</div></div>
      <div class="sp-section-title"><span>Current capacity pressure</span><span style="color:${fill}">${fmt(zone.utilization, 1)}% full</span></div><div class="sp-progress"><i style="width:${Math.min(100, Number(zone.utilization))}%;background:${fill}"></i></div>
      <div class="sp-forecast"><div class="sp-section-title"><span>30-minute occupancy forecast</span><span>${esc(forecastEngine)}</span></div><div class="sp-forecast-main"><strong>${fmt(forecastPct, 1)}% projected utilization</strong><span style="color:${forecastPct >= Number(zone.utilization) ? "var(--sp-red)" : "var(--sp-green)"}">${forecastPct >= Number(zone.utilization) ? "+" : ""}${fmt(forecastPct - Number(zone.utilization), 1)}%</span></div><div class="sp-location" style="margin-top:5px">${fmt(prediction, 1)} predicted occupied · ${fmt(Math.max(0, Number(zone.capacity) - prediction), 1)} projected free</div></div>
      <div style="margin-top:15px"><div class="sp-section-title"><span>Suggested reroute alternatives</span><span>${alternatives.length} ranked</span></div><div class="sp-alt-list">${alternatives.map((item) => `<button class="sp-alt" type="button" data-alt-zone="${esc(item.zone_id)}"><span><b>${esc(item.zone_id)} · ${esc(item.zone_name)}</b><small>${fmt(item.distance_km, 1)} km · ~${fmt(item.drive_minutes_estimate)} min</small></span><span style="text-align:right"><strong>${fmt(item.available)} free</strong><small>${fmt(item.utilization, 1)}% used</small></span></button>`).join("") || '<div class="sp-location">No lower-pressure alternative is currently available.</div>'}</div></div>
      <div class="sp-drawer-actions"><button class="sp-btn primary" id="sp-dispatch" type="button">Record VMS guidance</button><a class="sp-btn" href="https://www.openstreetmap.org/?mlat=${zone.latitude}&mlon=${zone.longitude}#map=17/${zone.latitude}/${zone.longitude}" target="_blank" rel="noreferrer" style="text-decoration:none;text-align:center">Open map</a></div>
      <div class="sp-drawer-links"><a href="/live-monitoring?zone=${encodeURIComponent(zone.zone_id)}">${state.health.kafka ? "Open live Kafka stream" : "Open stream monitor (offline)"} (${esc(zone.zone_id)})</a><button id="sp-zone-json" type="button">Download zone JSON</button></div>`;
    document.querySelectorAll("[data-alt-zone]").forEach((button) => button.onclick = () => selectZone(button.dataset.altZone));
    document.querySelector("#sp-zone-json").onclick = () => download(`/api/export?kind=zones&format=json&zone=${encodeURIComponent(zone.zone_id)}`);
    document.querySelector("#sp-dispatch").onclick = () => dispatchReroute(zone, alternatives[0]);
    document.querySelector("#sp-live-entry").onclick = () => recordLiveOccupancy(zone, "ENTRY");
    document.querySelector("#sp-live-exit").onclick = () => recordLiveOccupancy(zone, "EXIT");
    document.querySelector("#sp-live-set").onclick = () => recordLiveOccupancy(zone, "SET", Number(document.querySelector("#sp-live-value").value));
  }

  async function recordLiveOccupancy(zone, action, occupancy = null) {
    try {
      const body = { zone_id: zone.zone_id, action, source_type: "MANUAL_GATE", note: "Dashboard operator observation" };
      if (action === "SET") body.occupancy = occupancy;
      const result = await api("/api/hybrid/occupancy", { method: "POST", body: JSON.stringify(body) });
      const bridge = result.kafka_bridge?.published ? " and published to Kafka" : " (hybrid state saved)";
      toast(result.message + bridge);
      await refresh();
      await selectZone(zone.zone_id, false);
    } catch (error) { toast(`Occupancy update failed: ${error.message}`, true); }
  }

  async function dispatchReroute(source, destination) {
    if (!destination) return toast("No viable destination is available", true);
    modal("Confirm VMS guidance", `Record operator guidance away from <strong style="color:white">${esc(source.zone_name)} (${esc(source.zone_id)})</strong> toward <strong style="color:var(--sp-green)">${esc(destination.zone_name)} (${esc(destination.zone_id)})</strong>. Estimated transfer: ${fmt(destination.distance_km, 1)} km.`, [{ label: "Record guidance", primary: true, run: async () => {
      try {
        const result = await api("/api/action/reroute", { method: "POST", body: JSON.stringify({ source_zone: source.zone_id, target_zone: destination.zone_id }) });
        toast(`${result.action.action_id}: ${result.message}`);
      } catch (error) { toast(error.message, true); }
    } }]);
  }

  async function selectZone(zoneId, pan = true) {
    const zone = state.overview.zones.find((item) => item.zone_id === zoneId);
    if (!zone) return;
    state.selectedId = zoneId;
    try {
      const [mapData, prediction] = await Promise.all([api(`/api/map?zone=${encodeURIComponent(zoneId)}`), api(`/api/predictions?zone=${encodeURIComponent(zoneId)}`)]);
      state.mapData = mapData;
      state.prediction = prediction;
      renderMapLayers();
      renderDrawer();
      const marker = state.markers.get(zoneId);
      if (pan && marker && state.map && state.mode !== "GRID") state.map.panTo(marker.getLatLng(), { animate: true });
    } catch (error) { toast(`Zone telemetry unavailable: ${error.message}`, true); }
  }

  function updateFilterCounts() {
    const zones = state.overview.zones;
    const configs = [
      ["All Zones", "ALL", zones.length], ["High Vacancy", "VACANCY", zones.filter((zone) => Number(zone.available) > 40).length],
      ["Moderate (10-40)", "MODERATE", zones.filter((zone) => Number(zone.available) >= 10 && Number(zone.available) <= 40).length],
      ["Critical Risk", "CRITICAL", zones.filter((zone) => Number(zone.utilization) >= 85).length],
    ];
    configs.forEach(([needle, key, count]) => {
      const button = byText("main button", needle);
      if (!button) return;
      const countNode = button.querySelector("span:last-child");
      if (countNode) countNode.textContent = count;
      button.onclick = () => {
        state.filter = key;
        configs.forEach(([otherNeedle, otherKey]) => byText("main button", otherNeedle)?.classList.toggle("bg-surface-container-highest", otherKey === key));
        renderMapLayers();
      };
    });
  }

  function wireControls() {
    const search = document.querySelector("#zoneSearchInput");
    let searchTimer;
    if (search) search.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = search.value.trim();
        renderMapLayers();
        const match = filteredZones()[0];
        if (state.query && match) selectZone(match.zone_id);
      }, 220);
    };
    const modeButtons = ["Map", "Split", "Grid", "Satellite"];
    modeButtons.forEach((label) => {
      const button = exactButton(label);
      if (!button) return;
      button.onclick = () => {
        if (label === "Grid") state.mode = "GRID";
        else { state.mode = label === "Split" ? "SPLIT" : "MAP"; state.streetMode = label === "Satellite" ? "SATELLITE" : "STREET"; useBaseLayer(state.streetMode); }
        document.querySelector("#sp-map-layout").classList.toggle("sp-split", state.mode === "SPLIT");
        modeButtons.forEach((name) => exactButton(name)?.classList.toggle("bg-primary-container", name === label));
        renderMapLayers();
      };
    });
    updateFilterCounts();
    const layerConfig = [["Heatmap", "showHeat"], ["EV Nodes", "showNodes"], ["Risk Isobars", "showRisk"]];
    layerConfig.forEach(([needle, key]) => {
      const label = [...document.querySelectorAll("main label")].find((node) => clean(node.textContent).includes(needle));
      if (!label) return;
      if (needle === "EV Nodes") label.querySelector("span").textContent = "Zone Nodes";
      const checkbox = label.querySelector('input[type="checkbox"]');
      checkbox.checked = state[key];
      checkbox.onchange = () => { state[key] = checkbox.checked; renderMapLayers(); };
    });
    updateLeaf(document.querySelector("main"), "Find Optimal Slot", "Find Best Available Hub");
    const optimal = byText("main button", "Find Best Available Hub");
    if (optimal) optimal.onclick = () => {
      const best = [...state.overview.zones].filter((zone) => Number(zone.available) > 0).sort((a, b) => Number(a.utilization) - Number(b.utilization) || Number(b.available) - Number(a.available))[0];
      if (best) { selectZone(best.zone_id); toast(`${best.zone_id} selected: ${fmt(best.available)} bays available`); }
    };
    if (optimal && !document.querySelector("#sp-sync-live")) {
      const sync = document.createElement("button");
      sync.id = "sp-sync-live";
      sync.className = optimal.className;
      sync.textContent = "Sync Live Sources";
      optimal.parentElement.insertBefore(sync, optimal);
      sync.onclick = async () => {
        sync.disabled = true;
        const original = sync.textContent;
        sync.textContent = "Syncing…";
        try {
          const result = await api("/api/hybrid/sync", { method: "POST", body: JSON.stringify({ include_locations: true }) });
          const count = result?.parking_locations?.locations?.length || 0;
          toast(`Live weather refreshed${count ? ` · ${count} OpenStreetMap facilities loaded` : ""}`);
          await refresh();
        } catch (error) { toast(`Live-source sync failed: ${error.message}`, true); }
        finally { sync.disabled = false; sync.textContent = original; }
      };
    }
    const exportButton = byText("main button", "Export GeoJSON");
    if (exportButton) exportButton.onclick = () => download("/api/export?kind=zones&format=geojson");
    const globalZone = byText("body > div.pl-72 > header button", "All 20 Zones");
    if (globalZone && search) globalZone.onclick = () => { search.scrollIntoView({ behavior: "smooth", block: "center" }); search.focus(); };
    const liveWindow = byText("body > div.pl-72 > header button", "Live Window");
    if (liveWindow) liveWindow.onclick = () => {
      const hybrid = state.mapData?.hybrid?.sources?.occupancy?.available;
      const message = state.health.kafka
        ? "The map is showing broker-backed zone state. Health and zone values refresh automatically every 20 seconds."
        : hybrid
          ? "Hybrid mode is active. Operator observations override the stored baseline; live weather and OpenStreetMap facilities can be refreshed independently."
          : "The map remains available from its latest stored snapshot. Add an operator observation or reconnect the local pipeline to restore a current occupancy source.";
      modal("Map data window", message, [{ label: "Open stream monitor", primary: true, run: () => { window.location.href = ROUTES["live-monitoring"]; } }]);
    };
  }

  function updateFooter() {
    const footer = document.querySelector("main footer");
    if (!footer) return;
    const k = state.overview.kpis;
    updateLeaf(footer, "3,970", fmt(k.capacity));
    updateLeaf(footer, "1,146 Slots", `${fmt(k.available)} Slots`);
    updateLeaf(footer, "4 / 20 Hubs", `${fmt(k.risk_hubs)} / ${fmt(k.zones)} Hubs`);
    updateLeaf(footer, "Average Ingress Speed:", state.health.kafka ? "LIVE EVENT FLOW:" : "LAST OBSERVED FLOW:");
    updateLeaf(footer, "AVERAGE INGRESS SPEED:", state.health.kafka ? "LIVE EVENT FLOW:" : "LAST OBSERVED FLOW:");
    updateLeaf(footer, "LIVE EVENT FLOW:", state.health.kafka ? "LIVE EVENT FLOW:" : "LAST OBSERVED FLOW:");
    updateLeaf(footer, "LAST OBSERVED FLOW:", state.health.kafka ? "LIVE EVENT FLOW:" : "LAST OBSERVED FLOW:");
    updateLeaf(footer, "184 cars/min", `${fmt(k.entries_per_min + k.exits_per_min)} events/min`);
    const observed = state.mapData?.hybrid?.sources?.occupancy?.real_observations || 0;
    const source = state.health.kafka ? "Kafka + operator observations" : observed ? `${observed} operator-observed zones` : "stored baseline";
    updateLeaf(footer, "Geohash Buffer", `Map source: ${source}`);
    updateLeaf(footer, "Map telemetry:", `Map source: ${source}`);
    updateLeaf(footer, "Map source:", `Map source: ${source}`);
  }

  async function refresh() {
    try {
      const zoneId = state.selectedId || "";
      const [overview, health, mapData, prediction] = await Promise.all([
        api("/api/overview"), api("/api/health"), api(`/api/map?zone=${encodeURIComponent(zoneId)}`), api(`/api/predictions?zone=${encodeURIComponent(zoneId)}`),
      ]);
      state.overview = overview; state.health = health; state.mapData = mapData; state.prediction = prediction;
      updateChrome(); updateFooter(); updateFilterCounts(); renderMapLayers(); renderDrawer();
    } catch (error) { toast(`Map refresh failed: ${error.message}`, true); }
  }

  async function boot() {
    installStyles();
    wireNavigation();
    buildWorkspace();
    try {
      const requested = new URLSearchParams(location.search).get("zone") || "";
      [state.overview, state.health, state.mapData] = await Promise.all([api("/api/overview"), api("/api/health"), api(`/api/map?zone=${encodeURIComponent(requested)}`)]);
      state.selectedId = state.mapData.selected?.zone_id || state.overview.zones[0]?.zone_id || "";
      updateChrome();
      updateFooter();
      wireControls();
      try { await loadLeaflet(); createMap(); } catch { fallbackMap(); }
      await selectZone(state.selectedId, false);
      state.timer = setInterval(() => { if (!document.hidden) refresh(); }, 20000);
      document.body.dataset.smartparkMap = "ready";
    } catch (error) {
      toast(`Parking Map failed to initialize: ${error.message}`, true);
      console.error(error);
    }
  }

  boot();
})();
