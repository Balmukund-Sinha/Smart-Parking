(() => {
  "use strict";

  const ROUTES = {
    "Overview Telemetry": "/overview",
    "Live Sensors": "/live-monitoring",
    "Geospatial Explorer": "/parking-map",
    "Historical Analytics": "/historical-analytics",
    "Demand Prediction": "/demand-prediction",
    "Big Data Pipeline": "/big-data-pipeline",
    "Parquet Lakehouse": "/data-explorer",
    "Cluster Diagnostics": "/system-health",
  };
  const state = { overview: null, predictions: null, health: null, stream: null, layer: "Heatmap", filter: "ALL", query: "", map: null, markers: new Map(), heatLayer: null, vectorLayer: null };
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
  const byText = (selector, text, root = document) => [...root.querySelectorAll(selector)].find((node) => clean(node.textContent).includes(text));
  const exactButton = (text, root = document) => [...root.querySelectorAll("button")].find((node) => clean(node.textContent) === text);

  function addRuntimeStyles() {
    const style = document.createElement("style");
    style.textContent = `
      html{font-size:18px!important}
      body{line-height:1.45}
      .text-\\[9px\\]{font-size:12px!important;line-height:1.35!important}
      .text-\\[10px\\]{font-size:12.5px!important;line-height:1.4!important}
      .text-\\[11px\\]{font-size:13px!important;line-height:1.45!important}
      .h-\\[540px\\]{height:600px!important}
      .max-h-\\[360px\\]{max-height:440px!important}
      button,input{min-height:1.9rem}
      input::placeholder{opacity:.9}
      #sp-toast-stack{position:fixed;right:18px;bottom:18px;z-index:1000;display:grid;gap:8px;max-width:360px}
      .sp-toast{background:#0c1524;border:1px solid rgba(34,211,238,.35);color:#dbeafe;padding:10px 12px;border-radius:8px;box-shadow:0 16px 44px rgba(0,0,0,.45);font:600 11px/1.45 "JetBrains Mono",monospace;animation:sp-in .18s ease-out}
      .sp-toast.error{border-color:rgba(248,113,113,.5);color:#fecaca}
      .sp-modal-backdrop{position:fixed;inset:0;z-index:999;background:rgba(2,6,12,.76);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
      .sp-modal{width:min(520px,100%);background:#070d18;border:1px solid rgba(34,211,238,.32);border-radius:12px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.62);color:#cbd5e1}
      .sp-modal h2{font-size:14px;color:white;font-weight:700;margin:0 0 8px}.sp-modal p{font:11px/1.55 "JetBrains Mono",monospace;color:#94a3b8}
      .sp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.sp-actions button,.sp-actions a{padding:7px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.12);font:600 11px Inter,sans-serif;color:#cbd5e1;background:#0c1524;text-decoration:none}.sp-actions .primary{background:#0891b2;color:white;border-color:#22d3ee}
      .sp-pin-selected>div{box-shadow:0 0 0 2px rgba(34,211,238,.35),0 0 24px rgba(34,211,238,.22)!important;transform:scale(1.08)}
      #sp-real-map{position:absolute;inset:0;z-index:1;background:#06101d}
      #sp-real-map .leaflet-tile-pane{filter:brightness(.62) saturate(.72) contrast(1.2)}
      #sp-real-map .leaflet-control-attribution{background:rgba(4,8,16,.82);color:#94a3b8;font:10.5px "JetBrains Mono",monospace}
      #sp-real-map .leaflet-control-attribution a{color:#22d3ee}
      #sp-real-map .leaflet-tooltip{background:#070d18;color:#e2e8f0;border:1px solid rgba(34,211,238,.35);box-shadow:0 8px 28px rgba(0,0,0,.45);font:12px/1.5 "JetBrains Mono",monospace}
      #sp-real-map .leaflet-tooltip:before{border-top-color:#22d3ee}
      .sp-marker-shell{background:transparent;border:0}
      .sp-map-pin{height:30px;min-width:104px;padding:0 9px;border-radius:6px;background:rgba(7,13,24,.94);display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid currentColor;box-shadow:0 5px 16px rgba(0,0,0,.5);font:700 12px "JetBrains Mono",monospace;white-space:nowrap;transition:transform .16s,box-shadow .16s}
      .sp-map-pin:hover,.sp-map-pin.selected{transform:scale(1.1);box-shadow:0 0 0 2px rgba(34,211,238,.25),0 8px 24px rgba(0,0,0,.55)}
      .sp-map-pin.normal{color:#34d399}.sp-map-pin.moderate{color:#22d3ee}.sp-map-pin.critical{color:#f87171;background:rgba(69,10,10,.94)}
      .sp-map-pin i{width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 8px currentColor}
      @media(max-width:1600px){html{font-size:17px!important}.h-\\[540px\\]{height:560px!important}}
      aside nav a[aria-current="page"] span{color:#f8fafc!important}aside nav a[aria-current="page"] .material-symbols-outlined{color:#67e8f9!important}
      @keyframes sp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(style);
    const stack = document.createElement("div");
    stack.id = "sp-toast-stack";
    document.body.appendChild(stack);
  }

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `sp-toast${error ? " error" : ""}`;
    item.textContent = message;
    document.querySelector("#sp-toast-stack").appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  function modal(title, body, actions) {
    const backdrop = document.createElement("div");
    backdrop.className = "sp-modal-backdrop";
    backdrop.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${body}</p><div class="sp-actions"></div></section>`;
    const actionBar = backdrop.querySelector(".sp-actions");
    [...actions, { label: "Close" }].forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary) button.className = "primary";
      button.addEventListener("click", () => { if (action.run) action.run(); backdrop.remove(); });
      actionBar.appendChild(button);
    });
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
  }

  async function api(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  function wireNavigation() {
    document.querySelectorAll("aside nav a").forEach((anchor) => {
      const label = clean(anchor.querySelector("span.flex-1")?.textContent);
      if (ROUTES[label]) anchor.href = ROUTES[label];
    });
  }

  function wireGlobalControls() {
    const makeControl = (label, title, body, actions) => {
      const text = byText("header span", label);
      const control = text?.parentElement;
      if (!control) return;
      control.setAttribute("role", "button");
      control.setAttribute("tabindex", "0");
      control.setAttribute("aria-label", title);
      control.classList.add("cursor-pointer", "hover:border-cyan-500/40");
      const open = () => modal(title, body, actions);
      control.onclick = open;
      control.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      };
    };
    makeControl("All 20 Zones", "Mumbai zone scope", `This Overview aggregates all ${state.overview.kpis.zones} monitored Mumbai parking zones. Open a focused operational view to inspect an individual facility.`, [
      { label: "Live events", run: () => { location.href = "/live-monitoring"; } },
      { label: "Open parking map", primary: true, run: () => { location.href = "/parking-map"; } },
    ]);
    makeControl("Live Window", "Telemetry time window", "The Overview shows current operational state plus a 24-hour held-out model backtest. Use Historical Analytics to change the analytical range.", [
      { label: "Live monitoring", run: () => { location.href = "/live-monitoring"; } },
      { label: "Historical analytics", primary: true, run: () => { location.href = "/historical-analytics"; } },
    ]);
  }

  function updateLeaf(root, needle, value) {
    const node = [...root.querySelectorAll("span,p")].find((candidate) => candidate.children.length === 0 && clean(candidate.textContent).includes(needle));
    if (node) node.textContent = value;
    return node;
  }

  function updateHeader() {
    const { kpis, updated_at: updated } = state.overview;
    updateLeaf(document.querySelector("header"), "Zones Active", `${kpis.zones} Zones Active`);
    const stream = byText("header span", "ev/s");
    if (stream) stream.textContent = `${fmt(kpis.events_per_second, 2)} ev/s`;
    const lag = byText("header span", "ms lag");
    if (lag) lag.textContent = kpis.events_per_second > 0 ? "live" : "idle";
    const kafka = byText("header span", "12P OK");
    if (kafka) kafka.textContent = state.health.kafka ? "BROKER OK" : "OFFLINE";
    const spark = byText("header span", "BATCH #");
    if (spark) spark.textContent = state.health.spark ? "STREAMING" : "OFFLINE";
    const sync = [...document.querySelectorAll("header span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent)));
    if (sync) sync.textContent = `${new Date(updated || Date.now()).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST`;
    const alertButton = document.querySelector('header button[aria-label="Alerts"]');
    const alerts = state.overview.zones.filter((zone) => Number(zone.utilization) >= 85);
    if (alertButton) {
      const badge = alertButton.querySelector("span.absolute");
      if (badge) badge.textContent = alerts.length;
      alertButton.onclick = () => modal(
        `Capacity alerts (${alerts.length})`,
        alerts.length ? alerts.map((zone) => `${esc(zone.zone_id)} · ${esc(zone.zone_name)} — ${fmt(zone.utilization, 1)}% utilized`).join("<br>") : "No zone is currently above the 85% critical threshold.",
        []
      );
    }
  }

  function updateSidebar() {
    const { kpis } = state.overview;
    const live = byText("aside nav span", "/20");
    if (live) live.textContent = `${kpis.zones}/${kpis.zones}`;
    updateLeaf(document.querySelector("aside"), "ev/s", `${fmt(kpis.events_per_second, 2)} ev/s`);
    updateLeaf(document.querySelector("aside"), "ms", state.health.spark ? "streaming" : "offline");
    const cluster = byText("aside span", "ACTIVE");
    if (cluster) cluster.textContent = state.health.kafka && state.health.spark ? "● ACTIVE" : "● DEGRADED";
  }

  function kpiCard(label) {
    const labelNode = [...document.querySelectorAll("span")].find((node) => clean(node.textContent) === label);
    return labelNode?.closest("div.p-3");
  }

  function updateKpis() {
    const k = state.overview.kpis;
    let card = kpiCard("MMR Occupancy");
    if (card) {
      card.querySelector(".text-2xl").textContent = `${fmt(k.utilization, 1)}%`;
      const comparison = card.querySelector(".text-emerald-400.flex");
      if (comparison) comparison.textContent = "LIVE";
      updateLeaf(card, "vs 1h prior", `${fmt(k.occupied)} occupied across ${k.zones} zones`);
      updateLeaf(card, "24h Min", `Current occupied: ${fmt(k.occupied)}`);
      updateLeaf(card, "Max:", `Capacity: ${fmt(k.capacity)}`);
    }
    card = kpiCard("Available Bays");
    if (card) {
      card.querySelector(".text-2xl").textContent = fmt(k.available);
      const denominator = [...card.querySelectorAll("span")].find((node) => clean(node.textContent).startsWith("/"));
      if (denominator) denominator.textContent = `/ ${fmt(k.capacity)}`;
      updateLeaf(card, "bays released", `${fmt(k.available)} bays available now`);
      const bars = card.querySelectorAll(".h-1\\.5 > div");
      if (bars[0]) bars[0].style.width = `${k.utilization}%`;
      if (bars[1]) bars[1].style.width = `${100 - k.utilization}%`;
      updateLeaf(card, "In Use", `${fmt(k.occupied)} In Use`);
      updateLeaf(card, "% Free", `${fmt(100 - k.utilization, 1)}% Free`);
    }
    card = kpiCard("Zone Heartbeat");
    if (card) {
      card.querySelector(".text-2xl").textContent = `${k.zones}/${k.zones}`;
      updateLeaf(card, "100% ONLINE", state.health.kafka ? "100% ONLINE" : "DEGRADED");
      updateLeaf(card, "IoT sensor SLA", state.health.kafka ? "Telemetry broker responding" : "Broker health check failed");
    }
    card = kpiCard("Events Ingested");
    if (card) {
      card.querySelector(".text-2xl").textContent = k.events_ingested >= 1000 ? `${fmt(k.events_ingested / 1000, 1)}k` : fmt(k.events_ingested);
      updateLeaf(card, "today", "source events");
      updateLeaf(card, "ev/sec sustained", `${fmt(k.events_per_second, 2)} ev/sec live`);
      updateLeaf(card, "vs y'day", `${state.health.kafka ? "Kafka broker healthy" : "Kafka offline"}`);
      updateLeaf(card, "Kafka 12p", "Kafka topic live");
    }
    card = kpiCard("30m ML Risk Hubs");
    if (card) {
      card.querySelector(".text-2xl").textContent = `${k.risk_hubs} Zones`;
      updateLeaf(card, "Z003", k.risk_zone_ids.length ? k.risk_zone_ids.join(", ") : "No critical hubs");
      updateLeaf(card, "Predicted sat.", k.risk_hubs ? "Capacity action recommended" : "No immediate saturation risk");
      const modelScore = [...card.querySelectorAll("span")].find((node) => /R.*²/.test(clean(node.textContent)));
      if (modelScore) modelScore.textContent = `R²: ${fmt(state.predictions.metrics.r2, 3)}`;
    }
    card = kpiCard("Median Dwell");
    if (card) {
      card.querySelector(".text-2xl").innerHTML = `${fmt(k.median_dwell, 1)}<span class="text-sm font-normal text-slate-400">m</span>`;
      updateLeaf(card, "median 65m", "recent completed stays");
      updateLeaf(card, "turnovers/day/bay", `${k.median_dwell ? fmt(1440 / k.median_dwell, 1) : 0} est. daily turns`);
      updateLeaf(card, "Silver Delta Parquet", "Bronze event lake");
      const source = [...card.querySelectorAll("span")].find((node) => clean(node.textContent).includes("σ ="));
      if (source) source.textContent = "live lake";
    }
  }

  function riskMeta(zone, utilization = Number(zone.utilization)) {
    if (utilization >= 85) return { key: "CRITICAL", label: "CRITICAL RISK", text: "red", fill: "red-500", border: "border-red-500/40" };
    if (utilization >= 60) return { key: "MODERATE", label: "MODERATE", text: "cyan", fill: "cyan-400", border: "border-cyan-500/40" };
    return { key: "NORMAL", label: "NORMAL LOAD", text: "emerald", fill: "emerald-400", border: "border-emerald-500/40" };
  }

  function predictionsByZone() {
    const latest = new Map();
    state.predictions.series.forEach((row) => {
      const previous = latest.get(row.zone_id);
      if (!previous || String(row.timestamp) > String(previous.timestamp)) latest.set(row.zone_id, row);
    });
    return latest;
  }

  function renderInspector(zone) {
    const mapHeading = byText("h2", "Mumbai Metropolitan Region Geospatial Telemetry");
    const mapCard = mapHeading?.closest("div.rounded-xl");
    const inspectorLabel = byText("span", "REAL-TIME OCC", mapCard || document);
    const inspector = inspectorLabel?.closest("div.absolute");
    if (!inspector || !zone) return;
    const forecastOcc = Number(zone.forecast_occupancy_30m ?? zone.occupancy);
    const forecastPct = Math.min(100, zone.capacity ? forecastOcc / Number(zone.capacity) * 100 : 0);
    const meta = riskMeta(zone);
    const weather = state.overview.weather || {};
    inspector.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-white/10"><div class="flex items-center gap-1.5"><span class="px-1.5 py-0.5 rounded bg-${meta.text}-950 border border-${meta.text}-500/50 text-${meta.text}-400 font-mono text-[10px] font-bold">${esc(zone.zone_id)}</span><span class="text-xs font-semibold text-white">${esc(zone.zone_name)}</span></div><span class="px-1.5 py-0.5 rounded bg-${meta.text}-900/60 text-${meta.text}-300 font-mono text-[9px] font-bold">${meta.label}</span></div>
      <div class="pt-1.5 text-[9px] font-mono text-cyan-300">${Number(zone.latitude).toFixed(6)}, ${Number(zone.longitude).toFixed(6)} · Mumbai, Maharashtra</div>
      <div class="grid grid-cols-2 gap-2 my-2 text-[10px] font-mono">
        <div class="p-1.5 rounded bg-[#0c1524] border border-white/5"><span class="text-slate-400 block text-[9px]">REAL-TIME OCC</span><span class="text-${meta.text}-400 font-bold text-xs">${fmt(zone.utilization, 1)}%</span><span class="text-slate-400"> (${fmt(zone.occupancy)}/${fmt(zone.capacity)})</span></div>
        <div class="p-1.5 rounded bg-[#0c1524] border border-white/5"><span class="text-slate-400 block text-[9px]">30m ML FORECAST</span><span class="text-cyan-300 font-bold text-xs">${fmt(forecastPct, 1)}%</span><span class="text-slate-400"> (${forecastPct >= zone.utilization ? "+" : ""}${fmt(forecastPct - zone.utilization, 1)}%)</span></div>
        <div class="p-1.5 rounded bg-[#0c1524] border border-white/5"><span class="text-slate-400 block text-[9px]">MEAN DWELL</span><span class="text-slate-200 font-bold text-xs">${fmt(zone.mean_duration_min, 1)}m</span><span class="text-slate-400"> historical</span></div>
        <div class="p-1.5 rounded bg-[#0c1524] border border-white/5"><span class="text-slate-400 block text-[9px]">MICRO-WEATHER</span><span class="text-cyan-300 font-bold text-xs">${fmt(weather.temperature, 1)}°C</span><span class="text-slate-400"> ${fmt(weather.rainfall, 1)}mm rain</span></div>
      </div>
      <div class="flex items-center gap-2 pt-1 border-t border-white/5"><button data-action="reroute" class="flex-1 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-[11px] transition-colors flex items-center justify-center gap-1" type="button"><span class="material-symbols-outlined text-xs">alt_route</span><span>Reroute Traffic</span></button><button data-action="telemetry" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] transition-colors" type="button">Telemetry</button></div>`;
    inspector.querySelector('[data-action="reroute"]').onclick = () => confirmReroute(zone);
    inspector.querySelector('[data-action="telemetry"]').onclick = () => { location.href = `/live-monitoring?zone=${encodeURIComponent(zone.zone_id)}`; };
  }

  function confirmReroute(zone) {
    const destination = [...state.overview.zones].sort((a, b) => Number(b.available) - Number(a.available)).find((candidate) => candidate.zone_id !== zone.zone_id);
    modal("Confirm smart reroute", `Dispatch guidance away from <strong class="text-white">${esc(zone.zone_name)} (${esc(zone.zone_id)})</strong> toward <strong class="text-emerald-300">${esc(destination?.zone_name || "the best available hub")} (${esc(destination?.zone_id || "auto")})</strong>. This records an operator-approved guidance action; it does not execute arbitrary infrastructure commands.`, [{ label: "Apply guidance", primary: true, run: async () => {
      try {
        const result = await api("/api/action/reroute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_zone: zone.zone_id, target_zone: destination?.zone_id || "" }) });
        toast(`${result.message} · ${result.action?.action_id || "recorded"}`);
      } catch (error) {
        toast(`Reroute failed: ${error.message}`, true);
      }
    } }]);
  }

  function updateMap() {
    const mapHeading = byText("h2", "Mumbai Metropolitan Region Geospatial Telemetry");
    const mapCard = mapHeading?.closest("div.rounded-xl");
    const canvas = [...(mapCard?.querySelectorAll("div.relative") || [])].find((node) => String(node.className).includes("h-[540px]"));
    const oldInspector = byText("span", "REAL-TIME OCC", mapCard || document)?.closest("div.absolute");
    if (!canvas || !oldInspector) return;
    canvas.innerHTML = `<div id="sp-real-map" aria-label="Interactive street map of Mumbai parking zones"></div>${oldInspector.outerHTML}`;
    if (!window.L) {
      const bounds = "72.810,19.000,72.955,19.150";
      document.querySelector("#sp-real-map").innerHTML = `<iframe title="OpenStreetMap view of Mumbai parking zones" src="https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik" style="width:100%;height:100%;border:0;filter:brightness(.65) saturate(.75) contrast(1.15)"></iframe>`;
      toast("Interactive map library could not load; showing the OpenStreetMap fallback.", true);
    } else {
      state.map = L.map("sp-real-map", { zoomControl: false, minZoom: 10, maxZoom: 18, preferCanvas: true });
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' });
      let tileWarningShown = false;
      tiles.on("tileerror", () => { if (!tileWarningShown) { tileWarningShown = true; toast("Map tiles are temporarily unavailable; zone coordinates remain interactive.", true); } });
      tiles.addTo(state.map);
      state.heatLayer = L.layerGroup().addTo(state.map);
      state.vectorLayer = L.layerGroup().addTo(state.map);
      const bounds = [];
      state.overview.zones.forEach((zone) => {
        const latlng = [Number(zone.latitude), Number(zone.longitude)];
        if (!Number.isFinite(latlng[0]) || !Number.isFinite(latlng[1])) return;
        bounds.push(latlng);
        const marker = L.marker(latlng, { icon: mapIcon(zone), riseOnHover: true, keyboard: true, title: `${zone.zone_id} · ${zone.zone_name}` }).addTo(state.map);
        marker.bindTooltip(`<strong>${esc(zone.zone_name)}</strong><br>${esc(zone.zone_id)} · ${latlng[0].toFixed(6)}, ${latlng[1].toFixed(6)}<br>${fmt(zone.available)} of ${fmt(zone.capacity)} bays available`, { direction: "top", offset: [0, -16] });
        marker.on("click", () => selectMapZone(zone));
        state.markers.set(zone.zone_id, marker);
      });
      if (bounds.length) state.map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
      setTimeout(() => state.map?.invalidateSize(), 0);
    }
    const layerButtons = ["Heatmap", "Slots", "Risk ML", "Vectors"].map((label) => exactButton(label)).filter(Boolean);
    layerButtons.forEach((button) => button.onclick = () => { state.layer = clean(button.textContent); renderMapLayer(); });
    const zoomIn = document.querySelector('button[aria-label="Zoom in"]');
    const zoomOut = document.querySelector('button[aria-label="Zoom out"]');
    if (zoomIn) zoomIn.onclick = () => zoomMap(1);
    if (zoomOut) zoomOut.onclick = () => zoomMap(-1);
    updateLeaf(mapCard, "Micro-Batch Stream Refresh", `Micro-Batch Stream Refresh: ${fmt(state.stream?.summary?.micro_batch_seconds, 2)}s`);
    renderMapLayer();
    const first = state.overview.zones[0];
    if (first) selectMapZone(first, false);
  }

  function mapIcon(zone, selected = false, metric = null) {
    const utilization = metric == null ? Number(zone.utilization) : Number(metric);
    const meta = riskMeta(zone, utilization);
    const suffix = state.layer === "Slots" ? `${fmt(zone.available)} open` : state.layer === "Risk ML" ? `${fmt(utilization, 0)}% ML` : state.layer === "Vectors" ? "flow" : `${fmt(utilization, 0)}%`;
    return L.divIcon({ className: "sp-marker-shell", html: `<div class="sp-map-pin ${meta.key.toLowerCase()}${selected ? " selected" : ""}"><i></i><span>${esc(zone.zone_id)} ${esc(suffix)}</span></div>`, iconSize: [118, 30], iconAnchor: [59, 15] });
  }

  function selectMapZone(zone, pan = true) {
    if (!zone) return;
    state.selectedZoneId = zone.zone_id;
    renderMapLayer();
    renderInspector(zone);
    const marker = state.markers.get(zone.zone_id);
    if (pan && marker && state.map) state.map.panTo(marker.getLatLng(), { animate: true });
  }

  function renderMapLayer() {
    const forecasts = predictionsByZone();
    ["Heatmap", "Slots", "Risk ML", "Vectors"].forEach((label) => {
      const button = exactButton(label);
      if (!button) return;
      const active = label === state.layer;
      button.className = `px-2 py-0.5 rounded ${active ? "bg-cyan-600 text-white font-semibold" : "text-slate-400 hover:text-white"}`;
    });
    if (!state.map) return;
    state.heatLayer.clearLayers();
    state.vectorLayer.clearLayers();
    state.overview.zones.forEach((zone) => {
      const predictedPct = Number(zone.forecast_utilization_30m ?? zone.utilization);
      const metric = state.layer === "Risk ML" ? predictedPct : Number(zone.utilization);
      state.markers.get(zone.zone_id)?.setIcon(mapIcon(zone, zone.zone_id === state.selectedZoneId, metric));
      if (state.layer === "Heatmap") {
        const meta = riskMeta(zone);
        const color = meta.key === "CRITICAL" ? "#f87171" : meta.key === "MODERATE" ? "#22d3ee" : "#34d399";
        L.circle([Number(zone.latitude), Number(zone.longitude)], { radius: 180 + Number(zone.utilization) * 7, stroke: false, fillColor: color, fillOpacity: .13, interactive: false }).addTo(state.heatLayer);
      }
    });
    if (state.layer === "Vectors") {
      const center = [19.0760, 72.8777];
      state.overview.zones.slice(0, 7).forEach((zone) => {
        const growing = Number(zone.forecast_occupancy_30m ?? zone.occupancy) > Number(zone.occupancy);
        L.polyline([center, [Number(zone.latitude), Number(zone.longitude)]], { color: growing ? "#34d399" : "#f87171", weight: 1.5, opacity: .7, dashArray: growing ? null : "5 5", interactive: false }).addTo(state.vectorLayer);
      });
    }
  }

  function zoomMap(delta) {
    if (state.map) {
      if (delta > 0) state.map.zoomIn(); else state.map.zoomOut();
      toast(`Map zoom level ${state.map.getZoom()}`);
    }
  }

  function renderLeaderboard() {
    const heading = byText("h3", "Zone Risk Leaderboard");
    const card = heading?.closest("div.rounded-xl");
    if (!card) return;
    const ranked = state.overview.zones.filter((zone) => {
      const meta = riskMeta(zone);
      const matchesFilter = state.filter === "ALL" || meta.key === state.filter;
      const haystack = `${zone.zone_id} ${zone.zone_name}`.toLowerCase();
      return matchesFilter && haystack.includes(state.query.toLowerCase());
    });
    const list = [...card.querySelectorAll("div")].find((node) => String(node.className).includes("max-h-[360px]"));
    if (list) list.innerHTML = ranked.map((zone) => {
      const meta = riskMeta(zone);
      return `<button type="button" data-zone="${esc(zone.zone_id)}" class="block text-left w-full p-2 rounded bg-[#0c1524] border ${meta.border} hover:border-${meta.text}-500/70 transition-colors"><div class="flex items-center justify-between text-xs mb-1"><div class="flex items-center gap-1.5"><span class="font-mono font-bold text-${meta.text}-400">${esc(zone.zone_id)}</span><span class="text-white font-medium">${esc(zone.zone_name)}</span></div><span class="font-mono font-bold text-${meta.text}-400">${fmt(zone.utilization, 1)}%</span></div><div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-1"><div class="bg-${meta.fill} h-full rounded-full" style="width:${Math.min(100, Number(zone.utilization))}%"></div></div><div class="flex justify-between text-[10px] font-mono text-slate-400"><span>${fmt(zone.available)} slots open of ${fmt(zone.capacity)}</span><span class="text-${meta.text}-400 font-semibold">${meta.label}</span></div></button>`;
    }).join("") || '<div class="p-6 text-center text-slate-500 font-mono text-[11px]">No zones match this view.</div>';
    list?.querySelectorAll("button[data-zone]").forEach((button) => button.onclick = () => {
      const zone = state.overview.zones.find((item) => item.zone_id === button.dataset.zone);
      selectMapZone(zone);
    });
    const count = byText("span", "Hubs Ranked", card);
    if (count) count.textContent = `${ranked.length} Hubs Ranked`;
  }

  function wireLeaderboard() {
    const heading = byText("h3", "Zone Risk Leaderboard");
    const card = heading?.closest("div.rounded-xl");
    if (!card) return;
    const input = card.querySelector('input[placeholder*="Filter zone"]');
    if (input) input.oninput = () => { state.query = input.value.trim(); renderLeaderboard(); };
    const counts = { ALL: state.overview.zones.length, CRITICAL: 0, MODERATE: 0, NORMAL: 0 };
    state.overview.zones.forEach((zone) => counts[riskMeta(zone).key]++);
    ["ALL", "CRITICAL", "MODERATE", "NORMAL"].forEach((key) => {
      const button = [...card.querySelectorAll("button")].find((node) => clean(node.textContent).toUpperCase().startsWith(key === "ALL" ? "ALL" : key));
      if (!button) return;
      button.textContent = `${key[0]}${key.slice(1).toLowerCase()} (${counts[key]})`;
      button.onclick = () => {
        state.filter = key;
        ["ALL", "CRITICAL", "MODERATE", "NORMAL"].forEach((item) => {
          const candidate = [...card.querySelectorAll("button")].find((node) => clean(node.textContent).toUpperCase().startsWith(item));
          if (candidate) candidate.classList.toggle("bg-cyan-600", item === key);
        });
        renderLeaderboard();
      };
    });
    const exportButton = byText("button", "Export 20 Zones", card);
    if (exportButton) exportButton.onclick = () => modal("Export zone telemetry", "Choose a backend-generated export of the current authoritative zone dataset.", [
      { label: "Download CSV", run: () => download("/api/export?kind=zones&format=csv") },
      { label: "Download GeoJSON", primary: true, run: () => download("/api/export?kind=zones&format=geojson") },
    ]);
    renderLeaderboard();
  }

  function download(url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function aggregatePredictionSeries() {
    const groups = new Map();
    state.predictions.series.forEach((row) => {
      const key = String(row.timestamp);
      const bucket = groups.get(key) || { timestamp: key, actual: 0, predicted: 0 };
      bucket.actual += Number(row.current_occupancy || 0);
      bucket.predicted += Number(row.predicted_occupancy || 0);
      groups.set(key, bucket);
    });
    return [...groups.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-48);
  }

  function svgPath(values, width, height, max) {
    if (!values.length) return "";
    return values.map((value, index) => `${index ? "L" : "M"} ${(index / Math.max(1, values.length - 1) * width).toFixed(1)} ${(height - (value / Math.max(1, max)) * height).toFixed(1)}`).join(" ");
  }

  function updateDemandChart() {
    const heading = byText("h3", "24h Demand:");
    const card = heading?.closest("div.rounded-xl");
    const svg = card?.querySelector("svg");
    const series = aggregatePredictionSeries();
    if (!svg || !series.length) return;
    const max = Math.max(...series.flatMap((row) => [row.actual, row.predicted])) * 1.08;
    svg.innerHTML = `<defs><linearGradient id="spActual" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity=".24"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs><line stroke="#142236" stroke-dasharray="2 3" x1="0" x2="420" y1="30" y2="30"/><line stroke="#142236" stroke-dasharray="2 3" x1="0" x2="420" y1="70" y2="70"/><line stroke="#142236" stroke-dasharray="2 3" x1="0" x2="420" y1="110" y2="110"/><path d="${svgPath(series.map((row) => row.actual), 420, 138, max)} L 420 150 L 0 150 Z" fill="url(#spActual)"/><path d="${svgPath(series.map((row) => row.actual), 420, 138, max)}" stroke="#38bdf8" stroke-width="2.2" fill="none"/><path d="${svgPath(series.map((row) => row.predicted), 420, 138, max)}" stroke="#34d399" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`;
    const score = [...card.querySelectorAll("span")].find((node) => clean(node.textContent).includes("RÂ²") || clean(node.textContent).includes("R²"));
    if (score) score.textContent = `R² = ${fmt(state.predictions.metrics.r2, 3)}`;
    const annotation = [...card.querySelectorAll("div.absolute")].find((node) => clean(node.textContent).includes("Live:"));
    const latest = series.at(-1);
    if (annotation) annotation.textContent = `Latest sample: ${fmt(latest.actual)} actual · ${fmt(latest.predicted)} predicted`;
    updateLeaf(card, "Solid cyan", "Held-out observations vs Random Forest backtest predictions");
    updateLeaf(card, "Latest sample", "Latest sample");
    updateLeaf(card, "Model:", `Model: scikit-learn Random Forest (200 trees) · held-out R² ${fmt(state.predictions.metrics.r2, 3)}.`);
  }

  function updateCapacityChart() {
    const heading = byText("h3", "Hub Capacity Pressure");
    const card = heading?.closest("div.rounded-xl");
    const list = [...(card?.querySelectorAll("div.mt-3") || [])].find((node) => String(node.className).includes("space-y-2.5"));
    if (!list) return;
    list.innerHTML = state.overview.zones.slice(0, 5).map((zone) => {
      const meta = riskMeta(zone);
      return `<button type="button" data-capacity-zone="${esc(zone.zone_id)}" class="block w-full text-left"><div class="flex justify-between font-mono text-[10px] mb-1"><span class="text-white font-medium">${esc(zone.zone_name)} (${esc(zone.zone_id)})</span><span class="text-${meta.text}-400 font-bold">${fmt(zone.occupancy)} / ${fmt(zone.capacity)} (${fmt(zone.utilization, 1)}%)</span></div><div class="w-full h-2 rounded bg-slate-800 flex overflow-hidden"><div class="bg-${meta.fill} h-full" style="width:${zone.utilization}%"></div><div class="bg-emerald-400 h-full" style="width:${100 - zone.utilization}%"></div></div></button>`;
    }).join("");
    list.querySelectorAll("[data-capacity-zone]").forEach((button) => button.onclick = () => selectMapZone(state.overview.zones.find((zone) => zone.zone_id === button.dataset.capacityZone)));
  }

  function updateFlowChart() {
    const heading = byText("h3", "Dynamic Flow Delta");
    const card = heading?.closest("div.rounded-xl");
    if (!card) return;
    const k = state.overview.kpis;
    const badge = [...card.querySelectorAll("span")].find((node) => clean(node.textContent).includes("net"));
    if (badge) badge.textContent = `${k.flow_delta >= 0 ? "+" : ""}${k.flow_delta} net`;
    updateLeaf(card, "In:", `▲ In: ${k.entries_per_min} cars/m`);
    updateLeaf(card, "Out:", `▼ Out: ${k.exits_per_min} cars/m`);
    updateLeaf(card, "cars/min @", `${Math.max(k.entries_per_min, k.exits_per_min)} events in the latest minute`);
  }

  function wireAdvisory() {
    const apply = exactButton("Apply Smart Reroute");
    const dismiss = exactButton("Dismiss");
    const banner = document.querySelector("#sp-advisory-banner");
    const source = state.overview.zones[0];
    const destination = [...state.overview.zones].sort((a, b) => Number(b.available) - Number(a.available)).find((zone) => zone.zone_id !== source?.zone_id);
    const copy = document.querySelector("#sp-advisory-copy");
    if (copy && source && destination) {
      const sourceMeta = riskMeta(source);
      const pressureClass = sourceMeta.key === "CRITICAL" ? "text-red-400" : sourceMeta.key === "MODERATE" ? "text-cyan-300" : "text-emerald-300";
      const headline = sourceMeta.key === "CRITICAL" ? "Critical Capacity Advisory" : sourceMeta.key === "MODERATE" ? "Moderate Capacity Advisory" : "Network Capacity Normal";
      copy.innerHTML = `<span class="font-semibold text-white">${headline}:</span> highest current load is ${esc(source.zone_name)} (<span class="font-mono ${pressureClass} font-bold">${esc(source.zone_id)}: ${fmt(source.utilization, 1)}%</span>). Best overflow reserve: ${esc(destination.zone_name)} (<span class="font-mono text-emerald-400 font-bold">${esc(destination.zone_id)}: ${fmt(destination.available)} bays open</span>).`;
    }
    if (apply && source) apply.onclick = () => confirmReroute(source);
    if (dismiss && banner) dismiss.onclick = () => { banner.remove(); toast("Advisory dismissed for this view"); };
  }

  function markPipeline() {
    const stripHeading = byText("h4", "Big Data Telemetry Architecture");
    const strip = stripHeading?.closest("div.rounded-xl");
    if (!strip) return;
    const kafkaStage = byText("span", "Kafka", strip);
    const sparkStage = byText("span", "PySpark", strip) || byText("span", "Spark", strip);
    if (kafkaStage) kafkaStage.title = state.health.kafka ? "Kafka broker is healthy" : "Kafka broker is unavailable";
    if (sparkStage) sparkStage.title = state.health.spark ? "Spark streaming service is running" : "Spark service is unavailable";
    const updateStage = (title, metric, description) => {
      const titleNode = byText("span", title, strip);
      const stage = titleNode?.closest("div.rounded");
      if (!stage) return;
      const metricNode = [...stage.querySelectorAll("span")].find((node) => node !== titleNode && node.classList.contains("font-mono") && node.classList.contains("block"));
      if (metricNode) metricNode.textContent = metric;
      const descriptionNode = stage.querySelector("p");
      if (descriptionNode) descriptionNode.textContent = description;
    };
    const partitionCount = state.stream?.partitions?.length || 0;
    const lag = state.stream?.summary?.consumer_lag || 0;
    const batch = Number(state.stream?.summary?.micro_batch_seconds || 0);
    const watermark = state.stream?.summary?.watermark_minutes || 5;
    updateStage("Kafka Ingestion", `${partitionCount} partition${partitionCount === 1 ? "" : "s"} · lag ${fmt(lag)}`, "Replayable parking-events topic feeding the Structured Streaming consumer.");
    updateStage("PySpark 4.2 Stream", `${fmt(batch, 2)}s observed micro-batch`, `${watermark}-minute event-time watermarking protects late and out-of-order telemetry.`);
    updateStage("Apache Parquet Lake", "Bronze → Silver", "Snappy-compressed Apache Parquet stores replayable raw and analytical datasets.");
    updateStage("IoT Edge Sensors", "JSON event producer", "Simulated edge sensors publish typed ENTRY and EXIT telemetry.");
    updateStage("scikit-learn Random Forest", `30-min · R² ${fmt(state.predictions.metrics.r2, 3)}`, "Saved production model scores current zone, time, weather, capacity, and dwell features.");
    updateStage("Command Op-Center", "HTTP action API", "Operator-approved reroute guidance is validated and recorded by the backend.");
  }

  async function boot() {
    addRuntimeStyles();
    wireNavigation();
    try {
      const [overview, predictions, health, stream] = await Promise.all([
        api("/api/overview"),
        api("/api/predictions?zone=ALL"),
        api("/api/health"),
        api("/api/stream"),
      ]);
      state.overview = overview;
      state.predictions = predictions;
      state.health = health;
      state.stream = stream;
      wireGlobalControls();
      updateHeader();
      updateSidebar();
      updateKpis();
      wireAdvisory();
      updateMap();
      wireLeaderboard();
      updateDemandChart();
      updateCapacityChart();
      updateFlowChart();
      markPipeline();
    } catch (error) {
      toast(`Overview data unavailable: ${error.message}`, true);
      console.error(error);
    }
  }

  boot();
})();
