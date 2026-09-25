(() => {
  "use strict";

  const ROUTES = [
    ["overview", "/overview", "dashboard", "Overview"],
    ["live-monitoring", "/live-monitoring", "sensors", "Live Monitoring"],
    ["parking-map", "/parking-map", "map", "Parking Map"],
    ["historical-analytics", "/historical-analytics", "monitoring", "Historical Analytics"],
    ["demand-prediction", "/demand-prediction", "neurology", "Demand Prediction"],
    ["big-data-pipeline", "/big-data-pipeline", "account_tree", "Big Data Pipeline"],
    ["data-explorer", "/data-explorer", "database", "Data Explorer"],
    ["system-health", "/system-health", "dns", "System Health"]
  ];
  const route = window.SMARTPARK_ROUTE === "/" ? "/overview" : (window.SMARTPARK_ROUTE || location.pathname);
  const activeRoute = ROUTES.find((item) => item[1] === route) || ROUTES[0];
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const fmt = (value, digits) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits == null ? 0 : digits });

  function installBaseStyles() {
    const style = document.createElement("style");
    style.id = "sp-common-chrome-base";
    style.textContent = [
      ":root{--chrome-bg:#070d18;--chrome-panel:#0c1524;--chrome-high:#121e33;--chrome-line:rgba(148,163,184,.17);--chrome-text:#e2e8f0;--chrome-muted:#94a3b8;--chrome-cyan:#38bdf8;--chrome-teal:#2dd4bf;--chrome-green:#34d399}",
      "#sp-app-sidebar{position:fixed!important;inset:0 auto 0 0!important;z-index:50!important;width:270px!important;height:100vh!important;display:flex!important;flex-direction:column!important;background:var(--chrome-bg)!important;border-right:1px solid var(--chrome-line)!important;color:var(--chrome-text)!important;transition:transform .2s ease!important}",
      "#sp-app-sidebar .sp-side-main{display:flex;min-height:0;flex:1;flex-direction:column}.sp-brand{height:72px;display:flex;align-items:center;gap:11px;padding:0 18px;border-bottom:1px solid var(--chrome-line)}.sp-brand-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(135deg,#0891b2,#2dd4bf);color:#02131a;font:900 14px 'JetBrains Mono',monospace;box-shadow:0 0 24px rgba(45,212,191,.18)}.sp-brand-copy{min-width:0}.sp-brand-name{display:flex;align-items:center;gap:7px;color:#fff;font:800 17px/1.1 Inter,sans-serif}.sp-version{padding:3px 6px;border-radius:99px;background:#17294a;color:#67e8f9;font:700 10px 'JetBrains Mono',monospace}.sp-brand-sub{margin-top:4px;color:#38bdf8;font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.09em}.sp-nav-wrap{padding:18px 10px}.sp-nav-title{padding:0 9px 10px;color:#64748b;font:700 11px 'JetBrains Mono',monospace;letter-spacing:.1em}.sp-app-nav{display:grid;gap:5px}.sp-app-nav a{min-height:48px;display:flex;align-items:center;gap:12px;padding:0 13px;border:1px solid transparent;border-radius:9px;color:#a7b4c8;text-decoration:none;font:500 14px Inter,sans-serif;transition:.16s}.sp-app-nav a:hover{background:rgba(30,41,59,.75);color:#f8fafc}.sp-app-nav a .material-symbols-outlined{font-size:22px;color:#22d3ee}.sp-app-nav a[aria-current=page]{background:#0b4355!important;border-color:rgba(34,211,238,.5)!important;color:#fff!important;box-shadow:0 8px 26px rgba(8,145,178,.16)!important;font-weight:700!important}.sp-app-nav a[aria-current=page] span{color:#fff!important}.sp-app-nav a[aria-current=page] .material-symbols-outlined{color:#67e8f9!important}.sp-nav-live{width:8px;height:8px;margin-left:auto;border-radius:50%;background:var(--chrome-green);box-shadow:0 0 10px rgba(52,211,153,.7)}.sp-ai-tag{margin-left:auto;padding:2px 5px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--chrome-green)!important;font:700 9px 'JetBrains Mono',monospace}.sp-side-footer{padding:10px;border-top:1px solid var(--chrome-line)}.sp-engine{padding:11px;border:1px solid var(--chrome-line);border-radius:9px;background:var(--chrome-high)}.sp-engine-top{display:flex;justify-content:space-between;gap:8px;color:#64748b;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.08em}.sp-engine-state{color:var(--chrome-green)}.sp-engine-state:before{content:'';display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}.sp-engine-detail{margin-top:6px;color:#a7b4c8;font:600 11px 'JetBrains Mono',monospace}.sp-collapse{width:100%;min-height:38px!important;margin-top:5px;display:flex;align-items:center;justify-content:space-between;padding:0 8px;border:0;background:transparent;color:#94a3b8;font:600 11px 'JetBrains Mono',monospace}.sp-collapse:hover{color:#fff}",
      "#sp-app-header{position:fixed!important;left:270px!important;right:0!important;top:0!important;z-index:45!important;height:64px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;padding:0 22px!important;background:rgba(7,13,24,.97)!important;border-bottom:1px solid var(--chrome-line)!important;backdrop-filter:blur(14px)!important;color:var(--chrome-text)!important}.sp-breadcrumb{display:flex;align-items:center;gap:9px;min-width:260px;white-space:nowrap}.sp-breadcrumb strong{color:#f8fafc;font:700 15px Inter,sans-serif}.sp-breadcrumb .material-symbols-outlined{font-size:17px;color:#64748b}.sp-breadcrumb span:last-child{color:#94a3b8;font:600 13px Inter,sans-serif}.sp-header-tools{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}.sp-header-control{position:relative}.sp-header-button{min-height:40px!important;display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid var(--chrome-line);border-radius:8px;background:var(--chrome-high);color:#e2e8f0;font:700 12px Inter,sans-serif;white-space:nowrap}.sp-header-button:hover,.sp-header-button[aria-expanded=true]{border-color:rgba(56,189,248,.5);background:#17243a}.sp-header-button .material-symbols-outlined{font-size:18px;color:var(--chrome-cyan)}.sp-header-button .sp-chevron{font-size:16px;color:#64748b}.sp-chrome-menu{position:absolute;right:0;top:47px;z-index:100;width:280px;max-height:340px;overflow:auto;padding:7px;border:1px solid rgba(56,189,248,.28);border-radius:10px;background:#0b1424;box-shadow:0 22px 60px rgba(0,0,0,.55)}.sp-chrome-menu[hidden]{display:none}.sp-chrome-option{width:100%;min-height:39px!important;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:#cbd5e1;text-align:left;font:600 12px Inter,sans-serif}.sp-chrome-option:hover,.sp-chrome-option.active{background:rgba(8,145,178,.2);color:#fff}.sp-chrome-option small{color:#64748b;font:700 10px 'JetBrains Mono',monospace}.sp-live-pill{min-height:34px;display:flex;align-items:center;gap:7px;padding:0 10px;border:1px solid rgba(52,211,153,.14);border-radius:99px;background:rgba(52,211,153,.07);white-space:nowrap}.sp-live-dot{width:8px;height:8px;border-radius:50%;background:var(--chrome-green);box-shadow:0 0 10px rgba(52,211,153,.8)}.sp-live-label{color:var(--chrome-green);font:800 10px 'JetBrains Mono',monospace}.sp-live-rate{color:#94a3b8;font:600 10px 'JetBrains Mono',monospace}.sp-clock{display:flex;align-items:center;gap:5px;color:#94a3b8;font:600 10px 'JetBrains Mono',monospace;white-space:nowrap}.sp-clock .material-symbols-outlined{font-size:15px;color:#64748b}.sp-alert{position:relative;width:40px;min-width:40px;padding:0!important;justify-content:center}.sp-alert-count{position:absolute;right:-3px;top:-5px;min-width:17px;height:17px;display:grid;place-items:center;border-radius:50%;background:#fb7185;color:#250308;font:800 9px 'JetBrains Mono',monospace}.sp-alert-panel{width:360px}.sp-alert-row{padding:9px;border-radius:7px;background:#080f1c;border:1px solid var(--chrome-line);margin-bottom:6px}.sp-alert-row:last-child{margin-bottom:0}.sp-alert-row b{display:block;color:#f8fafc;font-size:12px}.sp-alert-row span{display:block;margin-top:2px;color:#94a3b8;font-size:11px}.sp-alert-ok{color:var(--chrome-green)!important}",
      "body>div.pl-72{padding-left:270px!important}body>div.pl-72>main{padding-top:64px!important}body>#sp-app-header+ #sp-app-sidebar+main,body>#sp-app-header~main{padding-left:270px!important;padding-top:64px!important}#sp-app-sidebar[data-collapsed=true]{transform:translateX(-100%)!important}#sp-app-sidebar[data-collapsed=true]+div.pl-72{padding-left:0!important}#sp-app-sidebar[data-collapsed=true]+div.pl-72>#sp-app-header{left:0!important}body.sp-sidebar-collapsed>#sp-app-header{left:0!important}body.sp-sidebar-collapsed>main{padding-left:0!important}body.sp-sidebar-collapsed>div.pl-72{padding-left:0!important}body.sp-sidebar-collapsed .sp-breadcrumb{padding-left:112px}.sp-dock-reopen{position:fixed;left:12px;top:12px;z-index:70;min-width:44px;height:40px;display:none;align-items:center;gap:7px;padding:0 12px;border:1px solid rgba(34,211,238,.5);border-radius:9px;background:#0b4355;color:#f8fafc;box-shadow:0 12px 34px rgba(0,0,0,.45),0 0 20px rgba(34,211,238,.12);font:700 12px Inter,sans-serif;cursor:pointer}.sp-dock-reopen:hover{background:#0e566b;border-color:#67e8f9}.sp-dock-reopen:focus-visible{outline:2px solid #67e8f9;outline-offset:3px}.sp-dock-reopen .material-symbols-outlined{font-size:21px;color:#67e8f9}body.sp-sidebar-collapsed>.sp-dock-reopen{display:flex}.sp-chrome-toast{position:fixed;right:18px;top:76px;z-index:3000;padding:11px 14px;border:1px solid rgba(56,189,248,.4);border-radius:9px;background:#121e33;color:#e2e8f0;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 12px 'JetBrains Mono',monospace}",
      "@media(max-width:1380px){#sp-app-sidebar{width:250px!important}#sp-app-header{left:250px!important}body>div.pl-72{padding-left:250px!important}body>#sp-app-header~main{padding-left:250px!important}.sp-header-button .sp-control-label{max-width:145px;overflow:hidden;text-overflow:ellipsis}.sp-breadcrumb{min-width:210px}.sp-clock{display:none}}@media(max-width:1080px){#sp-app-sidebar{transform:translateX(-100%)}body.sp-sidebar-open>#sp-app-sidebar{transform:translateX(0)!important}#sp-app-header{left:0!important}body>div.pl-72{padding-left:0!important}body>#sp-app-header~main{padding-left:0!important}.sp-dock-reopen{display:flex}body.sp-sidebar-open>.sp-dock-reopen{display:none}.sp-breadcrumb,body.sp-sidebar-collapsed .sp-breadcrumb{padding-left:50px}.sp-breadcrumb strong{display:none}.sp-breadcrumb{min-width:auto}.sp-header-window{display:none}}@media(max-width:720px){#sp-app-header{padding:0 10px!important}.sp-dock-reopen{left:8px;top:12px;width:40px;min-width:40px;padding:0;justify-content:center}.sp-dock-reopen .sp-dock-reopen-label{display:none}.sp-header-zone{display:none}.sp-live-label,.sp-breadcrumb .material-symbols-outlined{display:none}.sp-breadcrumb span:last-child{font-size:12px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function buildSidebar() {
    const old = document.querySelector("body > aside");
    if (!old) return;
    old.id = "sp-app-sidebar";
    old.removeAttribute("class");
    const links = ROUTES.map((item) => {
      const active = item[1] === activeRoute[1];
      const extra = item[0] === "live-monitoring" ? '<span class="sp-nav-live" title="Live"></span>' : item[0] === "demand-prediction" ? '<span class="sp-ai-tag">AI</span>' : "";
      return '<a data-path="' + item[0] + '" href="' + item[1] + '"' + (active ? ' aria-current="page"' : "") + '><span class="material-symbols-outlined">' + item[2] + '</span><span>' + item[3] + '</span>' + extra + '</a>';
    }).join("");
    old.innerHTML = '<div class="sp-side-main"><div class="sp-brand"><span class="sp-brand-mark">SP</span><div class="sp-brand-copy"><div class="sp-brand-name">SmartPark <span class="sp-version">v4.2</span></div><div class="sp-brand-sub">INTELLIGENCE</div></div></div><div class="sp-nav-wrap"><div class="sp-nav-title">MISSION TELEMETRY</div><nav class="sp-app-nav">' + links + '</nav></div></div><div class="sp-side-footer"><div class="sp-engine"><div class="sp-engine-top"><span>STREAM ENGINE</span><span class="sp-engine-state" id="sp-chrome-state">CHECKING</span></div><div class="sp-engine-detail" id="sp-chrome-detail">Kafka · Spark · PostgreSQL</div></div><button class="sp-collapse" id="sp-collapse" type="button"><span>Collapse Dock</span><span class="material-symbols-outlined">chevron_left</span></button></div>';
  }

  function buildHeader() {
    const header = document.querySelector("body > div.pl-72 > header, body > header");
    if (!header) return;
    header.id = "sp-app-header";
    header.removeAttribute("class");
    header.innerHTML = '<div class="sp-breadcrumb"><strong>Mumbai Metropolitan Region</strong><span class="material-symbols-outlined">chevron_right</span><span>' + esc(activeRoute[3]) + '</span></div><div class="sp-header-tools"><div class="sp-header-control sp-header-zone"><button class="sp-header-button" id="sp-zone-button" type="button" aria-expanded="false"><span class="material-symbols-outlined">location_city</span><span class="sp-control-label" id="sp-zone-label">All 20 Zones (Mumbai MMR)</span><span class="material-symbols-outlined sp-chevron">expand_more</span></button><div class="sp-chrome-menu" id="sp-zone-menu" hidden><button class="sp-chrome-option active" data-zone="ALL"><span>All 20 Zones</span><small>Mumbai MMR</small></button></div></div><div class="sp-header-control sp-header-window"><button class="sp-header-button" id="sp-window-button" type="button" aria-expanded="false"><span class="material-symbols-outlined">calendar_today</span><span class="sp-control-label" id="sp-window-label">Live Window (Last 24 Hours)</span><span class="material-symbols-outlined sp-chevron">expand_more</span></button><div class="sp-chrome-menu" id="sp-window-menu" hidden><button class="sp-chrome-option" data-window="1"><span>Last hour</span><small>1H</small></button><button class="sp-chrome-option active" data-window="24"><span>Last 24 hours</span><small>24H</small></button><button class="sp-chrome-option" data-window="168"><span>Last 7 days</span><small>7D</small></button><button class="sp-chrome-option" data-window="720"><span>Last 30 days</span><small>30D</small></button></div></div><div class="sp-live-pill"><span class="sp-live-dot"></span><span class="sp-live-label">LIVE</span><span class="sp-live-rate" id="sp-live-rate">— ev/s</span></div><div class="sp-clock"><span class="material-symbols-outlined">sync</span><span id="sp-clock">--:--:-- IST</span></div><div class="sp-header-control"><button class="sp-header-button sp-alert" id="sp-alert-button" type="button" aria-label="Alerts" aria-expanded="false"><span class="material-symbols-outlined">notifications</span><span class="sp-alert-count" id="sp-alert-count">0</span></button><div class="sp-chrome-menu sp-alert-panel" id="sp-alert-menu" hidden><div class="sp-alert-row"><b>Checking cluster status…</b><span>Loading current diagnostics.</span></div></div></div></div>';
    const reopen = document.createElement("button");
    reopen.id = "sp-dock-reopen";
    reopen.className = "sp-dock-reopen";
    reopen.type = "button";
    reopen.setAttribute("aria-label", "Open navigation dock");
    reopen.setAttribute("aria-controls", "sp-app-sidebar");
    reopen.setAttribute("aria-expanded", "false");
    reopen.innerHTML = '<span class="material-symbols-outlined">menu_open</span><span class="sp-dock-reopen-label">Open Dock</span>';
    document.body.appendChild(reopen);
  }

  function closeMenus(except) {
    document.querySelectorAll(".sp-chrome-menu").forEach((menu) => {
      if (menu !== except) menu.hidden = true;
    });
    document.querySelectorAll(".sp-header-button[aria-expanded]").forEach((button) => {
      if (!except || button.getAttribute("aria-controls") !== except.id) button.setAttribute("aria-expanded", "false");
    });
  }

  function toggleMenu(button, menu) {
    const opening = menu.hidden;
    closeMenus(opening ? menu : null);
    menu.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
  }

  function wireChrome() {
    const sidebar = document.querySelector("#sp-app-sidebar");
    const collapseButton = document.querySelector("#sp-collapse");
    const reopenButton = document.querySelector("#sp-dock-reopen");
    const setDockState = (collapsed, responsiveOpen) => {
      sidebar.dataset.collapsed = String(collapsed);
      document.body.classList.toggle("sp-sidebar-collapsed", collapsed);
      document.body.classList.toggle("sp-sidebar-open", Boolean(responsiveOpen));
      collapseButton.querySelector("span:first-child").textContent = collapsed ? "Expand Dock" : "Collapse Dock";
      collapseButton.querySelector(".material-symbols-outlined").textContent = collapsed ? "chevron_right" : "chevron_left";
      collapseButton.setAttribute("aria-expanded", String(!collapsed));
      reopenButton.setAttribute("aria-expanded", String(!collapsed || Boolean(responsiveOpen)));
    };
    collapseButton.setAttribute("aria-controls", "sp-app-sidebar");
    collapseButton.setAttribute("aria-expanded", "true");
    collapseButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const collapsed = sidebar.dataset.collapsed !== "true";
      setDockState(collapsed, false);
    }, true);
    reopenButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setDockState(false, window.matchMedia("(max-width: 1080px)").matches);
      collapseButton.focus({ preventScroll: true });
    }, true);
    const zoneButton = document.querySelector("#sp-zone-button");
    const zoneMenu = document.querySelector("#sp-zone-menu");
    const windowButton = document.querySelector("#sp-window-button");
    const windowMenu = document.querySelector("#sp-window-menu");
    const alertButton = document.querySelector("#sp-alert-button");
    const alertMenu = document.querySelector("#sp-alert-menu");
    zoneButton.setAttribute("aria-controls", zoneMenu.id);
    windowButton.setAttribute("aria-controls", windowMenu.id);
    alertButton.setAttribute("aria-controls", alertMenu.id);
    zoneButton.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); toggleMenu(zoneButton, zoneMenu); }, true);
    windowButton.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); toggleMenu(windowButton, windowMenu); }, true);
    alertButton.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); toggleMenu(alertButton, alertMenu); }, true);
    windowMenu.onclick = (event) => {
      const option = event.target.closest("[data-window]");
      if (!option) return;
      windowMenu.querySelectorAll("[data-window]").forEach((item) => item.classList.toggle("active", item === option));
      const names = { 1: "Live Window (Last Hour)", 24: "Live Window (Last 24 Hours)", 168: "Historical Window (7 Days)", 720: "Historical Window (30 Days)" };
      document.querySelector("#sp-window-label").textContent = names[option.dataset.window];
      localStorage.setItem("smartpark.windowHours", option.dataset.window);
      window.dispatchEvent(new CustomEvent("smartpark:window-change", { detail: { hours: Number(option.dataset.window) } }));
      closeMenus();
      showToast("Time window changed to " + option.querySelector("span").textContent);
    };
    zoneMenu.onclick = (event) => {
      const option = event.target.closest("[data-zone]");
      if (!option) return;
      zoneMenu.querySelectorAll("[data-zone]").forEach((item) => item.classList.toggle("active", item === option));
      document.querySelector("#sp-zone-label").textContent = option.dataset.zone === "ALL" ? "All 20 Zones (Mumbai MMR)" : option.dataset.zone + " · " + option.querySelector("span").textContent;
      localStorage.setItem("smartpark.zone", option.dataset.zone);
      window.dispatchEvent(new CustomEvent("smartpark:zone-change", { detail: { zone: option.dataset.zone } }));
      closeMenus();
      showToast("Zone context updated");
    };
    document.addEventListener("click", () => closeMenus());
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenus(); });
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateClock() {
    const target = document.querySelector("#sp-clock");
    if (target) target.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" }) + " IST";
  }

  function showToast(message) {
    document.querySelectorAll(".sp-chrome-toast").forEach((item) => item.remove());
    const toast = document.createElement("div");
    toast.className = "sp-chrome-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  async function loadLiveChrome() {
    try {
      const results = await Promise.all([
        fetch("/api/stream").then((response) => response.json()),
        fetch("/api/diagnostics").then((response) => response.json()),
        fetch("/api/map").then((response) => response.json()),
        fetch("/api/hybrid/status").then((response) => response.json())
      ]);
      const stream = results[0], diagnostics = results[1], map = results[2], hybrid = results[3];
      const kafkaCheck = diagnostics.checks.find((item) => item.name === "Kafka Broker");
      const liveRate = kafkaCheck?.ok ? stream.summary.events_per_second : 0;
      document.querySelector("#sp-live-rate").textContent = fmt(liveRate, 2) + " ev/s";
      const liveLabel = document.querySelector(".sp-live-label");
      const liveDot = document.querySelector(".sp-live-dot");
      const livePill = document.querySelector(".sp-live-pill");
      const hybridReady = Boolean(hybrid?.sources?.occupancy?.available);
      const operational = diagnostics.healthy || hybridReady;
      const stateLabel = diagnostics.healthy ? "LIVE" : hybridReady ? "HYBRID" : "DEGRADED";
      liveLabel.textContent = stateLabel;
      liveLabel.style.color = operational ? "#34d399" : "#f87171";
      liveDot.style.background = operational ? "#34d399" : "#f87171";
      liveDot.style.boxShadow = operational ? "0 0 10px rgba(52,211,153,.8)" : "0 0 10px rgba(248,113,113,.7)";
      livePill.style.borderColor = operational ? "rgba(52,211,153,.14)" : "rgba(248,113,113,.25)";
      livePill.style.background = operational ? "rgba(52,211,153,.07)" : "rgba(248,113,113,.08)";
      document.querySelector("#sp-chrome-state").textContent = diagnostics.healthy ? "OK" : hybridReady ? "HYBRID" : "DEGRADED";
      document.querySelector("#sp-chrome-state").style.color = operational ? "#34d399" : "#f87171";
      const observed = hybrid?.sources?.occupancy?.real_observations || 0;
      document.querySelector("#sp-chrome-detail").textContent = diagnostics.healthy
        ? "Kafka · Spark · PostgreSQL"
        : hybridReady
          ? `${observed} observed zones · ${hybrid?.sources?.state_store?.provider || "local state"}`
          : diagnostics.checks.filter((item) => !item.ok).map((item) => item.name).join(" · ");
      const failed = diagnostics.checks.filter((item) => !item.ok);
      document.querySelector("#sp-alert-count").textContent = String(failed.length);
      document.querySelector("#sp-alert-count").style.display = failed.length ? "grid" : "none";
      document.querySelector("#sp-alert-menu").innerHTML = failed.length ? failed.map((item) => '<div class="sp-alert-row"><b>' + esc(item.name) + '</b><span>' + esc(item.detail) + '</span></div>').join("") : '<div class="sp-alert-row"><b class="sp-alert-ok">All systems operational</b><span>Docker, Kafka, PySpark, PostgreSQL, and Parquet checks are passing.</span></div>';
      const zones = map.zones || [];
      const savedZone = localStorage.getItem("smartpark.zone") || "ALL";
      document.querySelector("#sp-zone-menu").innerHTML = '<button class="sp-chrome-option ' + (savedZone === "ALL" ? "active" : "") + '" data-zone="ALL"><span>All 20 Zones</span><small>Mumbai MMR</small></button>' + zones.map((zone) => '<button class="sp-chrome-option ' + (savedZone === zone.zone_id ? "active" : "") + '" data-zone="' + esc(zone.zone_id) + '"><span>' + esc(zone.zone_name) + '</span><small>' + esc(zone.zone_id) + '</small></button>').join("");
      const saved = zones.find((zone) => zone.zone_id === savedZone);
      if (saved) document.querySelector("#sp-zone-label").textContent = saved.zone_id + " · " + saved.zone_name;
    } catch (error) {
      document.querySelector("#sp-chrome-state").textContent = "OFFLINE";
      document.querySelector("#sp-chrome-state").style.color = "#f87171";
      document.querySelector("#sp-chrome-detail").textContent = "Integration API unavailable";
    }
  }

  function restoreWindow() {
    const hours = localStorage.getItem("smartpark.windowHours") || "24";
    const option = document.querySelector('[data-window="' + hours + '"]');
    if (option) option.click();
  }

  function enforceChrome() {
    const override = document.createElement("style");
    override.id = "sp-common-chrome-override";
    override.textContent = "#sp-app-sidebar .sp-app-nav a[aria-current=page],#sp-app-sidebar .sp-app-nav a[aria-current=page] span{color:#f8fafc!important}#sp-app-sidebar .sp-app-nav a[aria-current=page] .material-symbols-outlined{color:#67e8f9!important}#sp-app-sidebar{width:270px!important}#sp-app-header{left:270px!important}body>div.pl-72,body>#sp-app-header~main{padding-left:270px!important}@media(max-width:1380px){#sp-app-sidebar{width:250px!important}#sp-app-header{left:250px!important}body>div.pl-72,body>#sp-app-header~main{padding-left:250px!important}}@media(max-width:1080px){#sp-app-sidebar{transform:translateX(-100%)}#sp-app-header{left:0!important}body>div.pl-72,body>#sp-app-header~main{padding-left:0!important}}body.sp-sidebar-collapsed>#sp-app-header{left:0!important}body.sp-sidebar-collapsed>main,body.sp-sidebar-collapsed>div.pl-72{padding-left:0!important}";
    document.head.appendChild(override);
    document.querySelectorAll("#sp-app-sidebar .sp-app-nav a").forEach((anchor) => {
      const active = anchor.getAttribute("href") === activeRoute[1];
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current");
    });
  }

  function init() {
    installBaseStyles();
    buildSidebar();
    buildHeader();
    wireChrome();
    setTimeout(enforceChrome, 0);
    loadLiveChrome();
    setInterval(() => { if (!document.hidden) loadLiveChrome(); }, 20000);
    const hours = localStorage.getItem("smartpark.windowHours");
    if (hours && hours !== "24") {
      const option = document.querySelector('[data-window="' + hours + '"]');
      if (option) {
        document.querySelectorAll("[data-window]").forEach((item) => item.classList.toggle("active", item === option));
        const labels = { 1: "Live Window (Last Hour)", 24: "Live Window (Last 24 Hours)", 168: "Historical Window (7 Days)", 720: "Historical Window (30 Days)" };
        document.querySelector("#sp-window-label").textContent = labels[hours];
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
