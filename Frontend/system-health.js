(() => {
  "use strict";

  const ROUTES = { overview: "/overview", "live-monitoring": "/live-monitoring", "parking-map": "/parking-map", "historical-analytics": "/historical-analytics", "demand-prediction": "/demand-prediction", "big-data-pipeline": "/big-data-pipeline", "data-explorer": "/data-explorer", "system-health": "/system-health" };
  const state = { data: null, paused: false, timer: null };
  const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: d == null ? 0 : d });
  const duration = (seconds) => { const n = Number(seconds || 0); const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); return h ? h + "h " + m + "m" : m + "m"; };
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
      "html{font-size:19px!important;background:var(--sp-canvas)!important}body{line-height:1.5;background:var(--sp-canvas)!important;color:var(--sp-text)!important}.bg-background{background:var(--sp-canvas)!important}.bg-surface-container-low{background:var(--sp-shell)!important}.bg-surface-container-lowest{background:#03070d!important}.bg-surface-container{background:var(--sp-card)!important}.bg-surface-container-high{background:var(--sp-high)!important}.bg-surface-container-highest{background:var(--sp-top)!important}.text-on-surface{color:var(--sp-text)!important}.text-on-surface-variant{color:var(--sp-muted)!important}.text-outline{color:var(--sp-faint)!important}.text-primary{color:var(--sp-cyan)!important}.text-secondary{color:var(--sp-teal)!important}.text-tertiary{color:var(--sp-green)!important}.bg-primary{background:#0891b2!important}.bg-primary-container{background:#0e7490!important}.border-surface-variant,.border-outline-variant{border-color:var(--sp-line)!important}",
      ".text-\\[9px\\]{font-size:13px!important}.text-\\[10px\\]{font-size:13px!important}.text-\\[11px\\]{font-size:14px!important}button,input,select{min-height:42px;font-size:14px!important}aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}aside nav a{min-height:47px;border:1px solid transparent;border-radius:8px!important}aside nav a[aria-current=page]{background:rgba(8,145,178,.25)!important;border-color:rgba(34,211,238,.35)!important;color:#fff!important}aside nav a[aria-current=page] span{color:#f8fafc!important}aside nav a[aria-current=page] .material-symbols-outlined{color:#67e8f9!important}aside[data-collapsed=true]{transform:translateX(-100%)!important}aside[data-collapsed=true]+div.pl-72{padding-left:0!important}aside[data-collapsed=true]+div.pl-72>header{left:0!important}body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}",
      ".sp-page{display:grid;gap:18px;padding-top:18px;padding-bottom:40px}.sp-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.sp-eyebrow{display:flex;align-items:center;gap:9px;color:var(--sp-cyan);font:700 12px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase}.sp-live{padding:4px 8px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--sp-green);border:1px solid rgba(52,211,153,.24)}.sp-live.bad{background:rgba(248,113,113,.12);color:var(--sp-red);border-color:rgba(248,113,113,.25)}.sp-hero h1{font-size:34px;line-height:1.08;letter-spacing:-.035em;color:#fff;margin:9px 0 6px;font-weight:800}.sp-hero p{color:var(--sp-muted);font-size:15px;max-width:850px}.sp-actions,.sp-toolbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.sp-actions{justify-content:flex-end}.sp-btn{border:1px solid var(--sp-line);background:var(--sp-high);color:var(--sp-text);border-radius:8px;padding:9px 13px;font-weight:700;transition:.18s}.sp-btn:hover{border-color:rgba(56,189,248,.55);transform:translateY(-1px)}.sp-btn.primary{background:linear-gradient(90deg,#0891b2,#14b8a6);border-color:#22d3ee;color:#fff}.sp-btn.danger{border-color:rgba(248,113,113,.4);color:#fecaca}.sp-btn:disabled{opacity:.55;cursor:wait;transform:none}",
      ".sp-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}.sp-kpi,.sp-card{background:var(--sp-card);border:1px solid var(--sp-line);border-radius:13px;box-shadow:0 14px 40px rgba(0,0,0,.16)}.sp-kpi{padding:15px;min-height:128px}.sp-kpi-head{display:flex;justify-content:space-between;gap:8px;color:var(--sp-muted);font:700 11px 'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.06em}.sp-kpi-head .material-symbols-outlined{font-size:21px;color:var(--sp-cyan)}.sp-kpi-value{font-size:28px;font-weight:800;color:#fff;letter-spacing:-.04em;margin:11px 0 4px}.sp-kpi-value.green{color:var(--sp-green)}.sp-kpi-value.cyan{color:var(--sp-cyan)}.sp-kpi-value.red{color:var(--sp-red)}.sp-kpi-note{font-size:12px;color:var(--sp-muted)}.sp-card{padding:18px;min-width:0}.sp-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}.sp-card-head>div{min-width:0}.sp-card-head h2{font-size:20px;color:#fff;line-height:1.2;margin:0}.sp-card-head p{font-size:13px;color:var(--sp-muted);margin:4px 0 0}.sp-badge{padding:5px 8px;border-radius:6px;background:var(--sp-top);color:var(--sp-cyan);font:700 12px 'JetBrains Mono',monospace;white-space:nowrap}.sp-badge.green{color:var(--sp-green);background:rgba(52,211,153,.1)}.sp-badge.red{color:#fecaca;background:rgba(248,113,113,.13)}",
      ".sp-health-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(360px,.75fr);gap:18px;align-items:start}.sp-table-wrap{overflow:auto;border:1px solid var(--sp-line);border-radius:9px;background:var(--sp-shell)}.sp-table{width:100%;border-collapse:collapse;min-width:780px}.sp-table th{background:var(--sp-top);color:var(--sp-cyan);font:700 11px 'JetBrains Mono',monospace;text-align:left;text-transform:uppercase;padding:11px 12px}.sp-table td{border-top:1px solid var(--sp-line);padding:13px 12px;color:var(--sp-text);font-size:13px}.sp-table td code{font:12px 'JetBrains Mono',monospace;color:var(--sp-muted)}.sp-state{display:inline-flex;align-items:center;gap:6px;font:700 11px 'JetBrains Mono',monospace;color:var(--sp-green);text-transform:uppercase}.sp-state:before{content:'';width:8px;height:8px;border-radius:50%;background:currentColor}.sp-state.bad{color:var(--sp-red)}",
      ".sp-checks{display:grid;gap:9px}.sp-check{display:grid;grid-template-columns:38px minmax(0,1fr);gap:11px;padding:12px;border:1px solid var(--sp-line);background:var(--sp-shell);border-radius:9px}.sp-check-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(52,211,153,.12);color:var(--sp-green)}.sp-check.bad .sp-check-icon{background:rgba(248,113,113,.12);color:var(--sp-red)}.sp-check b{font-size:13px;color:#fff}.sp-check p{font-size:12px;color:var(--sp-muted);margin:3px 0 0;word-break:break-word}.sp-console-row{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:9px;margin-top:14px}.sp-select{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--sp-line);border-radius:8px;background:var(--sp-shell);color:var(--sp-text);padding:9px 11px}.sp-console-result{margin-top:11px;padding:11px;border-radius:8px;background:#03070d;border:1px solid var(--sp-line);color:var(--sp-green);font:12px/1.5 'JetBrains Mono',monospace;min-height:46px}",
      ".sp-health-grid>article:last-child .sp-checks{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sp-health-grid>article:last-child .sp-check{grid-template-columns:29px minmax(0,1fr);gap:8px;padding:9px}.sp-health-grid>article:last-child .sp-check-icon{width:27px;height:27px}.sp-health-grid>article:last-child .sp-check-icon .material-symbols-outlined{font-size:18px}.sp-health-grid>article:last-child .sp-check p{font-size:11px;line-height:1.35}",
      ".sp-lower{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:18px;align-items:start}.sp-partitions{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.sp-partition{padding:12px;border:1px solid var(--sp-line);background:var(--sp-shell);border-radius:9px}.sp-partition b{display:block;color:var(--sp-cyan);font:700 12px 'JetBrains Mono',monospace}.sp-partition strong{display:block;color:#fff;font-size:23px;margin:4px 0}.sp-partition span{color:var(--sp-muted);font-size:11px}.sp-meter{height:11px;background:var(--sp-top);border-radius:99px;overflow:hidden;margin:13px 0}.sp-meter i{height:100%;display:block;background:linear-gradient(90deg,var(--sp-cyan),var(--sp-green));border-radius:inherit}.sp-runtime{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.sp-runtime div{padding:11px;background:var(--sp-shell);border:1px solid var(--sp-line);border-radius:8px}.sp-runtime span{display:block;color:var(--sp-muted);font:700 10px 'JetBrains Mono',monospace;text-transform:uppercase}.sp-runtime b{display:block;color:#fff;font:700 13px 'JetBrains Mono',monospace;margin-top:4px}",
      ".sp-log{background:#03070d;border:1px solid var(--sp-line);border-radius:9px;padding:13px;max-height:335px;overflow:auto}.sp-log-row{display:grid;grid-template-columns:56px 145px minmax(0,1fr);gap:10px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.08);font:12px/1.45 'JetBrains Mono',monospace}.sp-log-row:last-child{border-bottom:0}.sp-log-level{color:var(--sp-green);font-weight:700}.sp-log-level.warn{color:var(--sp-amber)}.sp-log-level.error{color:var(--sp-red)}.sp-log-source{color:var(--sp-cyan)}.sp-log-message{color:var(--sp-muted);word-break:break-word}.sp-viva-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.sp-viva{padding:15px;border:1px solid var(--sp-line);background:var(--sp-shell);border-radius:9px}.sp-viva-label{color:var(--sp-green);font:700 11px 'JetBrains Mono',monospace;text-transform:uppercase}.sp-viva h3{font-size:16px;color:#fff;margin:7px 0}.sp-viva p{color:var(--sp-muted);font-size:13px;line-height:1.55;margin:0}.sp-viva code{display:block;margin-top:10px;background:var(--sp-high);color:var(--sp-cyan);padding:8px;border-radius:6px;font:11px/1.45 'JetBrains Mono',monospace}",
      "#sp-toasts{position:fixed;right:18px;bottom:18px;z-index:2200;display:grid;gap:8px;max-width:430px}.sp-toast{background:var(--sp-high);border:1px solid rgba(56,189,248,.4);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 13px/1.5 'JetBrains Mono',monospace}.sp-toast.error{border-color:rgba(248,113,113,.55);color:#fecaca}",
      "@media(max-width:1550px){html{font-size:18px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}.sp-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:1250px){.sp-health-grid>article:last-child .sp-checks{grid-template-columns:1fr}}@media(max-width:1100px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}.sp-health-grid,.sp-lower{grid-template-columns:1fr}.sp-hero{align-items:flex-start;flex-direction:column}.sp-actions{justify-content:flex-start}.sp-viva-grid{grid-template-columns:1fr}}@media(max-width:700px){.sp-kpis,.sp-runtime,.sp-partitions{grid-template-columns:1fr}.sp-console-row{grid-template-columns:1fr}.sp-log-row{grid-template-columns:50px 1fr}.sp-log-message{grid-column:1/-1}.sp-hero h1{font-size:29px}}"
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
    setTimeout(() => item.remove(), 4400);
  }

  function download(url) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((a) => {
      const active = a.dataset.path === "system-health";
      a.href = ROUTES[a.dataset.path] || "#";
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      a.classList.toggle("bg-primary-container", active);
      a.classList.toggle("text-on-primary-container", active);
      a.classList.toggle("font-semibold", active);
      a.classList.toggle("text-on-surface-variant", !active);
      if (!active) a.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("body > div.pl-72 > header span", "Executive Overview") || byText("body > div.pl-72 > header span", "System Health");
    if (context) context.textContent = "System Health";
    const collapse = byText("aside span", "Collapse Dock");
    if (collapse && collapse.parentElement) collapse.parentElement.onclick = () => {
      const aside = document.querySelector("aside");
      aside.dataset.collapsed = String(aside.dataset.collapsed !== "true");
    };
  }

  function buildPage() {
    const d = state.data;
    const summary = d.stream.summary;
    const offset = d.stream.partitions[0] ? d.stream.partitions[0].offset : 0;
    const online = d.checks.filter((item) => item.ok).length;
    const kpis = [
      ["verified_user", "Cluster SLA", d.healthy ? "100%" : fmt(online / d.checks.length * 100, 1) + "%", online + "/" + d.checks.length + " checks passing", d.healthy ? "green" : "red"],
      ["speed", "Ingestion velocity", fmt(summary.events_per_second, 2) + "/s", "Kafka event stream throughput", "cyan"],
      ["memory", "PySpark cadence", fmt(summary.micro_batch_seconds, 2) + "s", "Latest micro-batch interval", ""],
      ["hub", "Kafka position", fmt(offset), fmt(d.stream.partitions.length) + " active partition reading", "cyan"],
      ["folder_copy", "Parquet lake", fmt(d.parquet_files), "Bronze partition files indexed", "green"]
    ];
    document.querySelector("main > div").innerHTML = '<div class="sp-page">' +
      '<section class="sp-hero"><div><div class="sp-eyebrow"><span>Ops telemetry & control plane</span><span>Docker Compose · Windows host</span><span class="sp-live ' + (d.healthy ? "" : "bad") + '">' + (d.healthy ? "Cluster healthy" : "Attention required") + '</span></div><h1>System Health & Cluster Operations</h1><p>Read-only observability for Docker, Kafka, PySpark, PostgreSQL, and the Parquet lake, with allow-listed recovery and diagnostics.</p></div><div class="sp-actions"><button class="sp-btn primary" id="sp-check">Run health check</button><button class="sp-btn" id="sp-recover">Recover degraded services</button><button class="sp-btn" id="sp-pause">' + (state.paused ? "Resume refresh" : "Pause refresh") + '</button><button class="sp-btn" id="sp-export">Download diagnostics</button></div></section>' +
      '<section class="sp-kpis">' + kpis.map((item) => '<article class="sp-kpi"><div class="sp-kpi-head"><span>' + esc(item[1]) + '</span><span class="material-symbols-outlined">' + item[0] + '</span></div><div class="sp-kpi-value ' + item[4] + '">' + esc(item[2]) + '</div><div class="sp-kpi-note">' + esc(item[3]) + '</div></article>').join("") + '</section>' +
      '<section class="sp-health-grid"><article class="sp-card"><div class="sp-card-head"><div><h2>Container Orchestration Matrix</h2><p>Live services discovered from this project’s Docker Compose labels.</p></div><span class="sp-badge ' + (d.healthy ? "green" : "red") + '">' + d.services.length + ' services running</span></div><div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>Service</th><th>State</th><th>Health</th><th>Runtime status</th></tr></thead><tbody>' + d.services.map((service) => '<tr><td><strong>' + esc(service.name) + '</strong></td><td><span class="sp-state ' + (String(service.state).toLowerCase() === "running" ? "" : "bad") + '">' + esc(service.state) + '</span></td><td><code>' + esc(service.health || "process-level") + '</code></td><td><code>' + esc(service.status) + '</code></td></tr>').join("") + '</tbody></table></div></article>' +
      '<article class="sp-card"><div class="sp-card-head"><div><h2>Service Readiness</h2><p>Independent checks against every operational dependency.</p></div><span class="sp-badge">' + esc(new Date(d.checked_at).toLocaleTimeString("en-IN")) + '</span></div><div class="sp-checks">' + d.checks.map((check) => '<div class="sp-check ' + (check.ok ? "" : "bad") + '"><span class="sp-check-icon"><span class="material-symbols-outlined">' + (check.ok ? "check" : "priority_high") + '</span></span><div><b>' + esc(check.name) + '</b><p>' + esc(check.detail) + '</p></div></div>').join("") + '</div><div class="sp-console-row"><select class="sp-select" id="sp-command"><option value="full_health">Full health</option><option value="kafka_offsets">Kafka offsets</option><option value="postgres_readiness">PostgreSQL readiness</option><option value="parquet_inventory">Parquet inventory</option></select><button class="sp-btn" id="sp-execute">Execute</button></div><div class="sp-console-result" id="sp-result">Allow-listed diagnostic console ready.</div></article></section>' +
      '<section class="sp-lower"><article class="sp-card"><div class="sp-card-head"><div><h2>Kafka & Stream Telemetry</h2><p>Partition position and micro-batch execution signals.</p></div><span class="sp-badge green">Synchronized</span></div><div class="sp-partitions">' + (d.stream.partitions.length ? d.stream.partitions.map((p) => '<div class="sp-partition"><b>Partition ' + esc(p.partition) + '</b><strong>' + fmt(p.offset) + '</strong><span>' + esc(p.topic) + ' · committed offset</span></div>').join("") : '<div class="sp-partition"><b>No offsets</b><strong>—</strong><span>Kafka telemetry unavailable</span></div>') + '</div><div class="sp-meter"><i style="width:' + Math.max(8, Math.min(100, summary.micro_batch_seconds / 5 * 100)) + '%"></i></div><div class="sp-runtime"><div><span>Recent throughput</span><b>' + fmt(summary.events_per_second, 2) + ' ev/s</b></div><div><span>Peak throughput</span><b>' + fmt(summary.peak_events_per_second, 2) + ' ev/s</b></div><div><span>API uptime</span><b>' + duration(d.uptime_seconds) + '</b></div></div></article>' +
      '<article class="sp-card"><div class="sp-card-head"><div><h2>Live Cluster Telemetry Stream</h2><p>Current structured diagnostics from the integrated backend.</p></div><span class="sp-badge">LIVE</span></div><div class="sp-log">' + d.logs.map((row) => '<div class="sp-log-row"><span class="sp-log-level ' + row.level.toLowerCase() + '">' + esc(row.level) + '</span><span class="sp-log-source">' + esc(row.source) + '</span><span class="sp-log-message">' + esc(row.message) + '</span></div>').join("") + '</div></article></section>' +
      '<section class="sp-card"><div class="sp-card-head"><div><h2>Academic Viva Defense & Operational Rigor</h2><p>Architecture decisions grounded in the running implementation.</p></div><span class="sp-badge">Viva reference panel</span></div><div class="sp-viva-grid"><article class="sp-viva"><div class="sp-viva-label">Exactly-once intent</div><h3>Why Kafka plus checkpoints?</h3><p>Replayable offsets and idempotent event identifiers let the stream recover without silently losing telemetry or double-counting occupancy.</p><code>offset log → validation → checkpoint</code></article><article class="sp-viva"><div class="sp-viva-label">Failure recovery</div><h3>Why health-gated recovery?</h3><p>The control plane first checks every dependency and only runs the allow-listed Compose recovery path when a monitored service is degraded.</p><code>diagnose → recover only if needed</code></article><article class="sp-viva"><div class="sp-viva-label">Storage durability</div><h3>Why partitioned Parquet?</h3><p>Append-only columnar shards reduce scan cost, remain portable between PySpark and Pandas, and preserve inspectable historical evidence.</p><code>' + fmt(d.parquet_files) + ' files indexed locally</code></article></div></section>' +
      '</div>';
    updateChrome();
    wireActions();
  }

  function updateChrome() {
    const header = document.querySelector("body > div.pl-72 > header");
    if (!header || !state.data) return;
    const rate = byText("span", "ev/s", header);
    if (rate) rate.textContent = fmt(state.data.stream.summary.events_per_second, 2) + " ev/s";
    const clock = [...header.querySelectorAll("span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent)));
    if (clock) clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
    const side = byText("aside span", "OK") || byText("aside span", "DEGRADED");
    if (side) side.textContent = state.data.healthy ? "OK" : "DEGRADED";
  }

  async function refresh(showToast) {
    state.data = await api("/api/diagnostics");
    buildPage();
    if (showToast) toast(state.data.healthy ? "All monitored services are healthy" : "One or more services need attention", !state.data.healthy);
  }

  function wireActions() {
    document.querySelector("#sp-check").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Checking...";
      try { await refresh(true); } catch (error) { toast(error.message, true); }
    };
    document.querySelector("#sp-recover").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Inspecting...";
      try {
        const result = await api("/api/action/recover", { method: "POST", body: "{}" });
        toast(result.message, !result.ok);
        await refresh(false);
      } catch (error) { toast(error.message, true); button.disabled = false; button.textContent = "Recover degraded services"; }
    };
    document.querySelector("#sp-pause").onclick = () => {
      state.paused = !state.paused;
      document.querySelector("#sp-pause").textContent = state.paused ? "Resume refresh" : "Pause refresh";
      toast(state.paused ? "Automatic health refresh paused" : "Automatic health refresh resumed");
    };
    document.querySelector("#sp-export").onclick = () => { download("/api/diagnostics/export"); toast("Diagnostic JSON bundle prepared"); };
    document.querySelector("#sp-execute").onclick = () => {
      const command = document.querySelector("#sp-command").value;
      const check = command === "kafka_offsets" ? state.data.checks[1] : command === "postgres_readiness" ? state.data.checks[3] : command === "parquet_inventory" ? state.data.checks[4] : null;
      document.querySelector("#sp-result").textContent = check ? check.name + ": " + check.detail : state.data.checks.map((item) => item.name + "=" + (item.ok ? "OK" : "FAIL")).join(" · ");
      toast("Diagnostic command completed");
    };
  }

  async function init() {
    try {
      installStyles();
      wireNavigation();
      await refresh(false);
      state.timer = setInterval(() => { if (!state.paused) refresh(false).catch(() => {}); }, 15000);
    } catch (error) {
      toast(error.message, true);
      const main = document.querySelector("main > div");
      if (main) main.innerHTML = '<div class="sp-page"><section class="sp-card"><h2>System Health unavailable</h2><p>' + esc(error.message) + '</p></section></div>';
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
