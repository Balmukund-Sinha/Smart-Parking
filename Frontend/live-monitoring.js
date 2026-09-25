(() => {
  "use strict";

  const ROUTES = {
    overview: "/overview", "live-monitoring": "/live-monitoring", "parking-map": "/parking-map",
    "historical-analytics": "/historical-analytics", "demand-prediction": "/demand-prediction",
    "big-data-pipeline": "/big-data-pipeline", "data-explorer": "/data-explorer", "system-health": "/system-health",
  };
  const state = {
    streaming: true, interval: 1000, type: "ALL", zone: "ALL", query: "", status: "VERIFIED",
    page: 1, limit: 20, events: [], eventResult: null, stream: null, overview: null,
    eventTimer: null, statsTimer: null, loading: false,
  };
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
  const byText = (selector, text, root = document) => [...root.querySelectorAll(selector)].find((node) => clean(node.textContent).includes(text));
  const exactButton = (text, root = document) => [...root.querySelectorAll("button")].find((node) => clean(node.textContent) === text);

  function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :root{
        --sp-canvas:#040810;--sp-shell:#070d18;--sp-card:#0c1524;--sp-card-high:#121e33;
        --sp-card-top:#182742;--sp-line:rgba(148,163,184,.16);--sp-line-strong:rgba(56,189,248,.28);
        --sp-text:#e2e8f0;--sp-muted:#94a3b8;--sp-faint:#64748b;
        --sp-cyan:#38bdf8;--sp-teal:#2dd4bf;--sp-green:#34d399;--sp-red:#f87171;
      }
      html{font-size:18px!important;background:var(--sp-canvas)!important}
      body{line-height:1.5;background:var(--sp-canvas)!important;color:var(--sp-text)!important}
      .bg-background{background-color:var(--sp-canvas)!important}
      .bg-surface-container-low{background-color:var(--sp-shell)!important}
      .bg-surface-container-lowest{background-color:#03070d!important}
      .bg-surface-container{background-color:var(--sp-card)!important}
      .bg-surface-container-high{background-color:var(--sp-card-high)!important}
      .bg-surface-container-highest{background-color:var(--sp-card-top)!important}
      [class~="bg-surface-container-low/95"],[class~="bg-surface-container-low/90"]{background-color:rgba(7,13,24,.96)!important}
      [class~="bg-surface-container-lowest/90"],[class~="bg-surface-container-lowest/80"],[class~="bg-surface-container-lowest/60"]{background-color:rgba(3,7,13,.9)!important}
      [class~="bg-surface-container-high/60"],[class~="bg-surface-container-high/40"]{background-color:rgba(18,30,51,.7)!important}
      [class~="bg-surface-container/60"]{background-color:rgba(12,21,36,.72)!important}
      .text-on-surface{color:var(--sp-text)!important}.text-on-surface-variant{color:var(--sp-muted)!important}
      .text-outline{color:var(--sp-faint)!important}.text-primary{color:var(--sp-cyan)!important}
      .text-secondary{color:var(--sp-teal)!important}.text-tertiary{color:var(--sp-green)!important}
      .text-error{color:var(--sp-red)!important}
      .border-surface-variant,.border-outline-variant{border-color:var(--sp-line)!important}
      .bg-primary{background-color:#0891b2!important}.bg-primary-container{background-color:#0e7490!important}
      .bg-secondary{background-color:var(--sp-teal)!important}.bg-tertiary{background-color:var(--sp-green)!important}
      aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}
      aside>div:first-child>div.h-16{height:64px!important;border-bottom-color:var(--sp-line)!important}
      aside nav a{min-height:44px;border:1px solid transparent;border-radius:8px!important}
      aside nav a[aria-current="page"]{background:rgba(8,145,178,.24)!important;color:#fff!important;border-color:rgba(34,211,238,.3)!important;box-shadow:none!important}
      aside[data-collapsed="true"]{transform:translateX(-100%)!important}
      aside[data-collapsed="true"]+div.pl-72{padding-left:0!important}
      aside[data-collapsed="true"]+div.pl-72>header{left:0!important}
      body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}
      body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}
      body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}
      body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}
      main>div>.rounded-xl,main>div>.grid>.rounded-xl{border:1px solid var(--sp-line)!important;box-shadow:0 14px 40px rgba(0,0,0,.16)!important}
      main table{font-size:14px!important;line-height:1.45!important}main thead{font-size:12px!important}
      main input,main select,main button{font-size:13px}
      .text-\\[10px\\]{font-size:12.5px!important;line-height:1.4!important}
      button,input,select{min-height:1.9rem}
      #sp-live-toasts{position:fixed;right:18px;bottom:18px;z-index:1000;display:grid;gap:8px;max-width:380px}
      .sp-live-toast{background:var(--sp-card-high);border:1px solid var(--sp-line-strong);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.52);font:600 13px/1.5 "JetBrains Mono",monospace}
      .sp-live-toast.error{border-color:rgba(248,113,113,.5);color:#fecaca}
      .sp-modal-backdrop{position:fixed;inset:0;z-index:999;background:rgba(3,8,20,.78);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
      .sp-modal{width:min(560px,100%);background:var(--sp-card);border:1px solid var(--sp-line-strong);border-radius:12px;padding:18px;box-shadow:0 24px 90px rgba(0,0,0,.62);color:var(--sp-text)}.sp-modal h2{font-size:18px;font-weight:700;margin-bottom:8px}.sp-modal p{font:14px/1.6 "JetBrains Mono",monospace;color:var(--sp-muted)}.sp-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:16px}.sp-actions button{padding:8px 11px;border-radius:7px;background:var(--sp-card-high);border:1px solid var(--sp-line);font:600 13px Inter,sans-serif}.sp-actions .primary{background:#0891b2;color:white}
      .sp-empty{padding:42px;text-align:center;color:#869397;font:13px "JetBrains Mono",monospace}
      @media(max-width:1600px){html{font-size:17px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}}
      @media(max-width:1100px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}}
      aside nav a[aria-current="page"] span{color:#f8fafc!important}aside nav a[aria-current="page"] .material-symbols-outlined{color:#67e8f9!important}
    `;
    document.head.appendChild(style);
    const stack = document.createElement("div");
    stack.id = "sp-live-toasts";
    document.body.appendChild(stack);
  }

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `sp-live-toast${error ? " error" : ""}`;
    item.textContent = message;
    document.querySelector("#sp-live-toasts").appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  function modal(title, body, actions = []) {
    const backdrop = document.createElement("div");
    backdrop.className = "sp-modal-backdrop";
    backdrop.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${body}</p><div class="sp-actions"></div></section>`;
    const actionBar = backdrop.querySelector(".sp-actions");
    [...actions, { label: "Close" }].forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary) button.className = "primary";
      button.onclick = () => { action.run?.(); backdrop.remove(); };
      actionBar.appendChild(button);
    });
    backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); };
    document.body.appendChild(backdrop);
  }

  async function api(url) {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  function setLeaf(root, needle, value) {
    const node = [...root.querySelectorAll("span,p")].find((candidate) => candidate.children.length === 0 && clean(candidate.textContent).includes(needle));
    if (node) node.textContent = value;
    return node;
  }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((anchor) => {
      const path = anchor.dataset.path;
      anchor.href = ROUTES[path] || "#";
      const active = path === "live-monitoring";
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current");
      anchor.classList.toggle("bg-primary-container", active);
      anchor.classList.toggle("text-on-primary-container", active);
      anchor.classList.toggle("font-semibold", active);
      anchor.classList.toggle("text-on-surface-variant", !active);
      if (!active) anchor.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("header span", "Executive Overview");
    if (context) context.textContent = "Live Stream Operations";
    const collapse = byText("aside span", "Collapse Dock")?.parentElement;
    if (collapse) collapse.onclick = () => {
      const aside = document.querySelector("aside");
      const shell = document.querySelector("body > div.pl-72");
      const header = shell?.querySelector("header");
      const collapsed = aside.dataset.collapsed === "true";
      aside.dataset.collapsed = String(!collapsed);
      aside.style.transform = collapsed ? "" : "translateX(-100%)";
      aside.style.transition = "transform .2s ease";
      if (shell) shell.style.paddingLeft = collapsed ? "" : "0";
      if (header) header.style.left = collapsed ? "" : "0";
      if (!collapsed) toast("Navigation dock collapsed. Refresh to restore it.");
    };
  }

  function kpiCard(label) {
    return [...document.querySelectorAll("span")].find((node) => clean(node.textContent) === label)?.closest("div.p-space-md.rounded-xl");
  }

  function updateHeaderAndKpis() {
    if (!state.stream) return;
    const { summary, health } = state.stream;
    const headerRate = byText("header span", "ev/s");
    if (headerRate) headerRate.textContent = `${fmt(summary.events_per_second, 2)} ev/s`;
    const sync = [...document.querySelectorAll("header span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent)));
    if (sync) sync.textContent = `${new Date(state.stream.updated_at || Date.now()).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST`;
    setLeaf(document, "KAFKA CLUSTER :", `KAFKA CLUSTER : ${health.kafka ? "ONLINE" : "OFFLINE"}`);
    const totalOffset = state.stream.partitions.reduce((sum, item) => sum + Number(item.offset || 0), 0);
    setLeaf(document, "#94,208,114", `#${fmt(totalOffset)}`);
    setLeaf(document, "mumbai.telemetry.v4", "parking-events");
    const footerHealth = byText("aside span", "OK");
    if (footerHealth) footerHealth.textContent = health.kafka && health.spark ? "OK" : "DEGRADED";

    const values = [
      ["Ingestion Velocity", summary.events_per_second, "ev/sec", `Peak: ${fmt(summary.peak_events_per_second, 2)} ev/s`, `${state.stream.partitions.length} Partition${state.stream.partitions.length === 1 ? "" : "s"}`],
      ["Micro-batch Latency", summary.micro_batch_seconds, "sec", `Trigger: ${fmt(state.stream.spark.target_seconds, 1)}s`, health.spark ? "PySpark running" : "Spark offline"],
      ["Consumer Lag", summary.consumer_lag, "events", "Committed group lag", health.kafka ? "Broker healthy" : "Broker offline"],
      ["Deduplication Purge", summary.duplicates, "drops", `FP Rate: ${fmt(state.stream.bloom.false_positive_rate, 4)}%`, `k=${state.stream.bloom.hash_count} hashes`],
      ["Late Watermark", summary.watermark_minutes, "mins", `Threshold: -${summary.watermark_minutes * 60}s`, "Spark watermark"],
    ];
    values.forEach(([label, value, unit, left, right]) => {
      const card = kpiCard(label);
      if (!card) return;
      const metric = card.querySelector(".text-metric-xl");
      if (metric) metric.textContent = fmt(value, Number(value) % 1 ? 2 : 0);
      const unitNode = metric?.parentElement?.querySelector(".text-label-md");
      if (unitNode) unitNode.textContent = unit;
      const footer = card.querySelector(".border-t");
      if (footer) {
        const spans = footer.querySelectorAll("span");
        if (spans[0]) spans[0].textContent = left;
        if (spans[1]) spans[1].textContent = right;
      }
    });
  }

  function hashCode(value, salt = 0) {
    let hash = 2166136261 ^ salt;
    for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return Math.abs(hash >>> 0);
  }

  function updateBloom() {
    if (!state.stream) return;
    const heading = byText("span", "Bloom Filter Ingestion Pipeline");
    const card = heading?.closest("div.rounded-xl");
    if (!card) return;
    const bloom = state.stream.bloom;
    setLeaf(card, "128 KB (", `${fmt(bloom.memory_kb)} KB (${fmt(bloom.size_bits)} bits)`);
    const eventId = state.events[0]?.event_id || "waiting_for_event";
    const ingress = [...card.querySelectorAll("div.font-mono")].find((node) => clean(node.textContent).startsWith("ev_uuid"));
    if (ingress) ingress.textContent = String(eventId).slice(0, 18);
    const hashes = [...card.querySelectorAll(".grid.grid-cols-4 span")];
    hashes.slice(0, 7).forEach((node, index) => { node.textContent = `h${index + 1}: ${hashCode(eventId, index) % bloom.size_bits}`; });
    const saturationText = byText("span", "14.2% [", card);
    if (saturationText) saturationText.textContent = `${fmt(bloom.saturation, 2)}% [${fmt(bloom.bits_set)} / ${fmt(bloom.size_bits)} bits]`;
    const gauge = card.querySelector(".bg-gradient-to-r");
    if (gauge) gauge.style.width = `${Math.min(100, bloom.saturation)}%`;
    const counter = (label, value) => {
      const labelNode = [...card.querySelectorAll("span")].find((node) => clean(node.textContent) === label);
      const valueNode = labelNode?.parentElement?.querySelector(".text-headline-sm");
      if (valueNode) valueNode.textContent = typeof value === "number" ? fmt(value) : String(value);
    };
    counter("TOTAL CHECKED", bloom.total_checked);
    counter("ACCEPTED", bloom.accepted);
    counter("PURGED DUPS", bloom.purged);
    counter("MEMORY", `${bloom.memory_kb} KB`);
  }

  function formatIst(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  }

  function zoneName(zoneId) {
    return state.overview?.zones.find((zone) => zone.zone_id === zoneId)?.zone_name || zoneId;
  }

  function eventRow(event, duplicate) {
    const id = String(event.event_id || "unknown");
    const utilization = Math.min(100, Number(event.capacity) ? Number(event.occupancy) / Number(event.capacity) * 100 : 0);
    const color = utilization >= 85 ? "error" : utilization >= 60 ? "primary" : "tertiary";
    const kind = String(event.event_type || "UNKNOWN").toUpperCase();
    const kindColor = kind === "ENTRY" ? "tertiary" : "error";
    const node = String(hashCode(event.zone_id) % 24 + 1).padStart(2, "0");
    return `<tr class="hover:bg-surface-container/60 transition-colors group${duplicate ? " opacity-60" : ""}" data-event-id="${esc(id)}">
      <td class="py-space-sm px-space-md font-mono text-primary"><div class="flex items-center gap-space-2xs"><span>${esc(id.slice(0, 18))}</span><button data-copy="${esc(id)}" class="opacity-60 hover:opacity-100 text-outline" title="Copy UUID" type="button"><span class="material-symbols-outlined text-base">content_copy</span></button></div></td>
      <td class="py-space-sm px-space-md font-mono text-on-surface-variant whitespace-nowrap">${esc(formatIst(event.timestamp))}</td>
      <td class="py-space-sm px-space-md"><span class="font-mono text-${color} font-bold">${esc(event.zone_id)}</span><span class="block text-on-surface">${esc(zoneName(event.zone_id))}</span></td>
      <td class="py-space-sm px-space-md font-mono text-on-surface">${esc(event.vehicle_id || "—")}</td>
      <td class="py-space-sm px-space-md"><span class="px-space-2xs py-space-3xs rounded bg-${kindColor}/10 text-${kindColor} font-mono font-bold">${esc(kind)}${duplicate ? " DUP" : ""}</span></td>
      <td class="py-space-sm px-space-md min-w-40"><div class="flex justify-between font-mono"><span>${fmt(event.occupancy)}/${fmt(event.capacity)}</span><span class="text-${color}">${fmt(utilization, 1)}%</span></div><div class="mt-space-2xs h-1.5 bg-surface-container-highest rounded overflow-hidden"><div class="h-full bg-${color} rounded" style="width:${utilization}%"></div></div></td>
      <td class="py-space-sm px-space-md font-mono text-on-surface-variant whitespace-nowrap">Node #${node}<span class="block">${fmt(event.temperature, 1)}°C · Rain ${fmt(event.rainfall, 1)}mm</span></td>
      <td class="py-space-sm px-space-md"><span class="text-${duplicate ? "error" : "tertiary"} font-mono font-semibold">${duplicate ? "Bloom Purged" : "Verified → Parquet"}</span></td>
      <td class="py-space-sm px-space-md text-right"><button data-details="${esc(id)}" class="p-space-xs rounded hover:bg-surface-container text-outline hover:text-on-surface" type="button" aria-label="View event details"><span class="material-symbols-outlined text-lg">more_horiz</span></button></td>
    </tr>`;
  }

  function renderEvents() {
    const tbody = document.querySelector("#stream-table-body");
    if (!tbody) return;
    const seen = new Set();
    let rows = state.events.map((event) => {
      const id = String(event.event_id);
      const duplicate = seen.has(id);
      seen.add(id);
      return { event, duplicate };
    });
    if (state.status === "VERIFIED") rows = rows.filter((row) => !row.duplicate);
    if (state.type === "DROP") rows = rows.filter((row) => row.duplicate);
    tbody.innerHTML = rows.length ? rows.map((row) => eventRow(row.event, row.duplicate)).join("") : '<tr><td colspan="9" class="sp-empty">No stream events match the active filters.</td></tr>';
    tbody.querySelectorAll("button[data-copy]").forEach((button) => button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); toast("Event UUID copied"); } catch { toast(`UUID: ${button.dataset.copy}`); }
    });
    tbody.querySelectorAll("button[data-details]").forEach((button) => button.onclick = () => {
      const event = state.events.find((item) => String(item.event_id) === button.dataset.details);
      modal("Event telemetry", `<strong class="text-primary">${esc(event?.event_id)}</strong><br>Zone: ${esc(event?.zone_id)} · ${esc(zoneName(event?.zone_id))}<br>Vehicle: ${esc(event?.vehicle_id)}<br>Timestamp: ${esc(formatIst(event?.timestamp))}<br>Coordinates: ${fmt(event?.latitude, 6)}, ${fmt(event?.longitude, 6)}<br>Weather: ${fmt(event?.temperature, 1)}°C · ${fmt(event?.rainfall, 1)}mm rainfall`);
    });
    const footer = byText("span", "frames held in ring buffer");
    if (footer) footer.textContent = `Live buffer · ${fmt(state.eventResult?.count)} recent frames available`;
    const pageLabel = [...document.querySelectorAll("span")].find((node) => /^Page \d+ of/.test(clean(node.textContent)));
    if (pageLabel) pageLabel.textContent = `Page ${state.eventResult?.page || 1} of ${state.eventResult?.pages || 1}`;
  }

  function renderPartitions() {
    if (!state.stream) return;
    const heading = byText("span", "Kafka Partition Lag Distribution");
    const card = heading?.closest("div.rounded-xl");
    if (!card) return;
    const partitions = state.stream.partitions;
    setLeaf(card, "Partition 00 through", partitions.length ? `Live topic topology · ${partitions.length} active partition${partitions.length === 1 ? "" : "s"}` : "No partition metadata returned");
    const grid = [...card.querySelectorAll("div.grid")].find((node) => String(node.className).includes("md:grid-cols-6"));
    if (grid) grid.innerHTML = partitions.map((partition) => `<div class="p-space-xs rounded-lg bg-surface-container flex flex-col space-y-space-3xs"><div class="flex justify-between text-outline text-label-sm"><span>P-${String(partition.partition).padStart(2, "0")}</span><span class="text-tertiary">lag ${fmt(partition.lag)}</span></div><div class="w-full h-1 rounded-full bg-surface-container-highest overflow-hidden"><div class="h-full bg-tertiary rounded-full" style="width:${partition.lag ? 70 : 20}%"></div></div><span class="text-[10px] text-on-surface-variant truncate">offset ${fmt(partition.offset)}</span></div>`).join("") || '<div class="sp-empty col-span-full">Kafka partition telemetry unavailable.</div>';
    const status = byText("span", "ALL HEALTHY", card);
    if (status) status.textContent = state.stream.health.kafka ? "BROKER HEALTHY" : "OFFLINE";
  }

  function pathFor(values, width = 600, height = 88) {
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    return values.map((value, index) => `${index ? "L" : "M"} ${(index / Math.max(1, values.length - 1) * width).toFixed(1)} ${(height - ((value - min) / Math.max(.01, max - min)) * (height - 16) + 6).toFixed(1)}`).join(" ");
  }

  function renderSparkChart() {
    if (!state.stream) return;
    const heading = byText("span", "PySpark Micro-Batch Execution");
    const card = heading?.closest("div.rounded-xl");
    const svg = card?.querySelector("svg");
    const samples = state.stream.spark.samples.map(Number);
    if (!card || !svg || !samples.length) return;
    const line = pathFor(samples);
    svg.innerHTML = `<defs><linearGradient id="sparkLiveGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".34"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><line stroke="#3d494c" stroke-dasharray="4,4" x1="0" x2="600" y1="50" y2="50"/><path d="${line} L 600 100 L 0 100 Z" fill="url(#sparkLiveGradient)"/><path d="${line}" stroke="currentColor" stroke-width="2.5" fill="none" vector-effect="non-scaling-stroke"/>`;
    setLeaf(card, "Target Trigger", `Target trigger: ${fmt(state.stream.spark.target_seconds, 1)}s · ${state.stream.spark.running ? "stream active" : "stream offline"}`);
    setLeaf(card, "Avg:", `Avg: ${fmt(state.stream.summary.micro_batch_seconds, 2)}s`);
  }

  function populateZones() {
    const select = document.querySelector("select");
    if (!select || !state.overview) return;
    select.innerHTML = `<option value="ALL">All ${state.overview.zones.length} Mumbai Zones</option>${state.overview.zones.map((zone) => `<option value="${esc(zone.zone_id)}">${esc(zone.zone_id)} · ${esc(zone.zone_name)}</option>`).join("")}`;
    select.value = state.zone;
    select.onchange = () => { state.zone = select.value; state.page = 1; loadEvents(); };
    const headerZone = byText("header button", "All 20 Zones");
    if (headerZone) headerZone.onclick = () => { select.scrollIntoView({ behavior: "smooth", block: "center" }); select.focus(); };
  }

  function updateFilterButtons() {
    const belt = document.querySelector("#table-search")?.closest("div.w-full.rounded-xl");
    if (!belt || !state.stream) return;
    const summary = state.stream.summary;
    const configs = [
      ["All (", "ALL", summary.buffered_events], ["ENTRY (", "ENTRY", summary.entries],
      ["EXIT (", "EXIT", summary.exits], ["Filter Drops", "DROP", summary.duplicates],
    ];
    configs.forEach(([prefix, key, count]) => {
      const button = byText("button", prefix, belt);
      if (!button) return;
      const label = key === "DROP" ? `Filter Drops (${fmt(count)})` : `${key === "ALL" ? "All" : key} (${fmt(count)})`;
      const dot = button.querySelector("span.w-1\\.5")?.outerHTML || "";
      button.innerHTML = `${dot}${label}`;
      button.classList.toggle("bg-surface-container-highest", state.type === key);
      button.classList.toggle("text-on-surface", state.type === key);
      button.onclick = () => { state.type = key; state.page = 1; loadEvents(); };
    });
  }

  function wireControls() {
    const search = document.querySelector("#table-search");
    let searchTimer;
    if (search) search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = search.value.trim(); state.page = 1; loadEvents(); }, 250); };
    const streamButton = document.querySelector("#stream-toggle");
    if (streamButton) streamButton.onclick = () => {
      state.streaming = !state.streaming;
      document.querySelector("#stream-toggle-icon").textContent = state.streaming ? "pause" : "play_arrow";
      document.querySelector("#stream-toggle-text").textContent = state.streaming ? "Live Ingestion" : "Resume Ingestion";
      streamButton.classList.toggle("bg-primary", state.streaming);
      if (state.streaming) { restartEventTimer(); loadEvents(); } else clearInterval(state.eventTimer);
      toast(state.streaming ? "Live event polling resumed" : "Live event polling paused");
    };
    [1, 2, 5].forEach((seconds) => {
      const button = exactButton(`${seconds}s`);
      if (!button) return;
      button.onclick = () => {
        state.interval = seconds * 1000;
        [1, 2, 5].forEach((value) => exactButton(`${value}s`)?.classList.toggle("bg-primary-container", value === seconds));
        restartEventTimer();
        toast(`Refresh interval set to ${seconds} second${seconds === 1 ? "" : "s"}`);
      };
    });
    const purge = byText("button", "Purge Buffer");
    if (purge) purge.onclick = () => modal("Purge local stream buffer?", "This clears only the rows currently held in this browser. Kafka, Spark, and stored Parquet data are not deleted.", [{ label: "Purge local view", primary: true, run: () => { state.streaming = false; clearInterval(state.eventTimer); state.events = []; renderEvents(); document.querySelector("#stream-toggle-icon").textContent = "play_arrow"; document.querySelector("#stream-toggle-text").textContent = "Resume Ingestion"; toast("Local stream view purged"); } }]);
    const exportButton = byText("button", "Export Stream");
    if (exportButton) exportButton.onclick = () => modal("Export parking event stream", "Download the backend event dataset in a machine-readable format.", [{ label: "Download CSV", run: () => download("/api/export?kind=events&format=csv") }, { label: "Download JSON", primary: true, run: () => download("/api/export?kind=events&format=json") }]);
    const statusButton = byText("button", "Status: Verified");
    if (statusButton) statusButton.onclick = () => { state.status = state.status === "VERIFIED" ? "ALL" : "VERIFIED"; setLeaf(statusButton, "Status:", `Status: ${state.status === "VERIFIED" ? "Verified" : "All"}`); renderEvents(); };
    const previous = byText("button", "Prev 50");
    const next = byText("button", "Next 50");
    if (previous) { previous.textContent = `‹ Prev ${state.limit}`; previous.onclick = () => { if (state.page > 1) { state.page--; loadEvents(); } }; }
    if (next) { next.textContent = `Next ${state.limit} ›`; next.onclick = () => { if (state.page < (state.eventResult?.pages || 1)) { state.page++; loadEvents(); } }; }
    const alertButton = document.querySelector('header button[aria-label="Alerts"]');
    if (alertButton) alertButton.onclick = () => modal("Stream health", `Kafka broker: <strong class="text-tertiary">${state.stream?.health.kafka ? "healthy" : "offline"}</strong><br>Spark stream: <strong class="text-tertiary">${state.stream?.health.spark ? "running" : "offline"}</strong><br>Consumer lag: ${fmt(state.stream?.summary.consumer_lag)} events<br>Bloom duplicates in buffer: ${fmt(state.stream?.summary.duplicates)}`);
    const windowButton = byText("header button", "Live Window");
    if (windowButton) windowButton.onclick = () => modal("Live stream window", `The ledger displays the latest ${fmt(state.stream?.summary.buffered_events)} backend-buffered events and refreshes every ${state.interval / 1000}s. Historical windows are available from Historical Analytics.`);
  }

  function download(url) {
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }

  async function loadEvents() {
    if (state.loading || !state.streaming) return;
    state.loading = true;
    try {
      const params = new URLSearchParams({ limit: state.limit, page: state.page });
      if (state.query) params.set("q", state.query);
      if (state.zone !== "ALL") params.set("zone", state.zone);
      if (state.type === "ENTRY" || state.type === "EXIT") params.set("type", state.type);
      state.eventResult = await api(`/api/events?${params}`);
      state.events = state.eventResult.events;
      renderEvents();
      updateBloom();
    } catch (error) { toast(`Event stream unavailable: ${error.message}`, true); }
    finally { state.loading = false; }
  }

  async function loadStats() {
    try {
      state.stream = await api("/api/stream");
      updateHeaderAndKpis(); updateBloom(); updateFilterButtons(); renderPartitions(); renderSparkChart();
    } catch (error) { toast(`Pipeline telemetry unavailable: ${error.message}`, true); }
  }

  function restartEventTimer() {
    clearInterval(state.eventTimer);
    if (state.streaming) state.eventTimer = setInterval(loadEvents, state.interval);
  }

  function safeRender(label, render) {
    try { return render(); }
    catch (error) {
      console.error(`[Live Monitoring] ${label} failed`, error);
      return null;
    }
  }

  async function boot() {
    installStyles(); wireNavigation();
    try {
      [state.overview, state.stream] = await Promise.all([api("/api/overview"), api("/api/stream")]);
      safeRender("header and KPI telemetry", updateHeaderAndKpis);
      safeRender("zone selector", populateZones);
      safeRender("controls", wireControls);
      safeRender("event filters", updateFilterButtons);
      safeRender("partition telemetry", renderPartitions);
      safeRender("Spark chart", renderSparkChart);
      await loadEvents();
      safeRender("Bloom telemetry", updateBloom);
      restartEventTimer();
      state.statsTimer = setInterval(loadStats, 5000);
      document.body.dataset.smartparkLive = "ready";
    } catch (error) { toast(`Live Monitoring failed to initialize: ${error.message}`, true); console.error(error); }
  }

  boot();
})();
