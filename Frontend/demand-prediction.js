(() => {
  "use strict";

  const ROUTES = {
    overview: "/overview", "live-monitoring": "/live-monitoring", "parking-map": "/parking-map",
    "historical-analytics": "/historical-analytics", "demand-prediction": "/demand-prediction",
    "big-data-pipeline": "/big-data-pipeline", "data-explorer": "/data-explorer", "system-health": "/system-health",
  };
  const COLORS = { cyan: "#38bdf8", teal: "#2dd4bf", green: "#34d399", red: "#f87171", amber: "#fbbf24", purple: "#a78bfa" };
  const state = { overview: null, health: null, predictions: null, model: null, benchmark: null, selectedZone: "", selectedDay: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1, result: null };
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
      .text-\[9px\]{font-size:13px!important;line-height:1.4!important}.text-\[10px\]{font-size:13px!important;line-height:1.45!important}.text-\[11px\]{font-size:14px!important;line-height:1.45!important}button,input,select{min-height:40px;font-size:14px!important}
      aside{width:270px!important;background:var(--sp-shell)!important;border-right:1px solid var(--sp-line)!important}aside>div:first-child>div.h-16{height:64px!important;border-bottom-color:var(--sp-line)!important}aside nav a{min-height:46px;border:1px solid transparent;border-radius:8px!important}aside nav a[aria-current="page"]{background:rgba(8,145,178,.24)!important;color:#fff!important;border-color:rgba(34,211,238,.3)!important;box-shadow:none!important}aside nav a[aria-current="page"]>span:not(.text-tertiary){color:#e2e8f0!important}aside[data-collapsed="true"]{transform:translateX(-100%)!important}aside[data-collapsed="true"]+div.pl-72{padding-left:0!important}aside[data-collapsed="true"]+div.pl-72>header{left:0!important}
      body>div.pl-72{padding-left:270px!important;background:var(--sp-canvas)!important}body>div.pl-72>header{left:270px!important;height:64px!important;background:rgba(7,13,24,.96)!important;border-bottom:1px solid var(--sp-line)!important;backdrop-filter:blur(14px)}body>div.pl-72>main{padding-top:64px!important;background:var(--sp-canvas)!important}body>div.pl-72>main>div{max-width:1720px!important;margin-inline:auto!important}
      .sp-page{display:grid;gap:18px;padding-top:18px;padding-bottom:34px}.sp-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.sp-eyebrow{display:flex;align-items:center;gap:9px;color:var(--sp-cyan);font:700 12px "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase}.sp-live-pill{padding:4px 8px;border-radius:99px;background:rgba(52,211,153,.12);color:var(--sp-green);border:1px solid rgba(52,211,153,.22)}.sp-hero h1{font-size:34px;line-height:1.08;letter-spacing:-.035em;color:white;margin:9px 0 6px;font-weight:800}.sp-hero p{color:var(--sp-muted);font-size:15px;max-width:820px}.sp-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px}.sp-btn{border:1px solid var(--sp-line);background:var(--sp-card-high);color:var(--sp-text);border-radius:8px;padding:9px 13px;font-weight:700;transition:.18s}.sp-btn:hover{border-color:rgba(56,189,248,.45);transform:translateY(-1px)}.sp-btn.primary{background:linear-gradient(90deg,#0891b2,#14b8a6);border-color:#22d3ee;color:white}.sp-btn.active{background:#0e7490;border-color:#22d3ee;color:white}.sp-btn:disabled{opacity:.55;cursor:wait;transform:none}.sp-model-tabs{display:flex;gap:5px;padding:4px;background:var(--sp-card);border:1px solid var(--sp-line);border-radius:9px}.sp-model-tabs button{padding:8px 10px;border-radius:6px;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace}.sp-model-tabs button.active{background:#0e7490;color:white}
      .sp-training-strip{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 15px;background:var(--sp-shell);border:1px solid var(--sp-line);border-radius:10px;color:var(--sp-muted);font-size:13px}.sp-training-strip strong{color:white}.sp-training-meta{display:flex;gap:15px;font:600 12px "JetBrains Mono",monospace;white-space:nowrap}.sp-training-meta b{color:var(--sp-green)}
      .sp-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.sp-kpi,.sp-card{background:var(--sp-card);border:1px solid var(--sp-line);border-radius:13px;box-shadow:0 14px 40px rgba(0,0,0,.16)}.sp-kpi{padding:16px;min-width:0;min-height:142px}.sp-kpi-head{display:flex;justify-content:space-between;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.06em}.sp-kpi-head .material-symbols-outlined{font-size:21px}.sp-kpi-value{font-size:29px;font-weight:800;letter-spacing:-.04em;color:white;margin:12px 0 5px;white-space:nowrap}.sp-kpi-value.cyan{color:var(--sp-cyan)}.sp-kpi-value.green{color:var(--sp-green)}.sp-kpi-note{font-size:13px;line-height:1.45;color:var(--sp-muted)}
      .sp-workspace{display:grid;grid-template-columns:minmax(390px,.78fr) minmax(0,1.45fr);gap:18px;align-items:start}.sp-left,.sp-right{display:grid;gap:18px}.sp-card{padding:18px}.sp-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}.sp-card-head h2{font-size:20px;line-height:1.2;color:white;margin:0}.sp-card-head p{font-size:13px;color:var(--sp-muted);margin:4px 0 0}.sp-badge{padding:5px 8px;border-radius:6px;background:var(--sp-card-top);color:var(--sp-cyan);font:700 12px "JetBrains Mono",monospace;white-space:nowrap}.sp-badge.green{color:var(--sp-green);background:rgba(52,211,153,.1)}.sp-badge.red{color:#fecaca;background:rgba(248,113,113,.16)}.sp-badge.amber{color:#fde68a;background:rgba(251,191,36,.13)}
      .sp-section-label{margin:14px 0 7px;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.06em}.sp-presets{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.sp-preset{background:var(--sp-card-high);border:1px solid var(--sp-line);border-radius:7px;padding:8px 9px;text-align:left;color:var(--sp-text);font-size:13px}.sp-preset:hover,.sp-preset.active{border-color:var(--sp-cyan);color:white}.sp-field{display:grid;gap:7px;margin-top:13px}.sp-field-head{display:flex;justify-content:space-between;gap:12px;color:var(--sp-muted);font:700 12px "JetBrains Mono",monospace;text-transform:uppercase}.sp-field-head output{color:var(--sp-cyan)}.sp-select{width:100%;border:1px solid var(--sp-line);background:var(--sp-card-high);color:white;border-radius:8px;padding:9px 11px}.sp-slider{width:100%;accent-color:#22d3ee}.sp-scale{display:flex;justify-content:space-between;color:var(--sp-faint);font:11px "JetBrains Mono",monospace}.sp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.sp-day{border:1px solid var(--sp-line);background:var(--sp-card-high);color:var(--sp-muted);border-radius:6px;padding:6px 2px;min-height:34px!important;font:700 11px "JetBrains Mono",monospace}.sp-day.active{background:#0e7490;border-color:var(--sp-cyan);color:white}.sp-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 12px;margin-top:14px;border-radius:8px;background:var(--sp-card-high);font-size:13px}.sp-toggle{appearance:none!important;-webkit-appearance:none!important;position:relative;width:48px!important;height:26px!important;min-height:26px!important;flex:0 0 48px;border:1px solid var(--sp-line);border-radius:999px;background:#1e293b;cursor:pointer;transition:.18s}.sp-toggle:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#cbd5e1;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:.18s}.sp-toggle:checked{background:#0e7490;border-color:#22d3ee}.sp-toggle:checked:after{left:25px;background:white}.sp-toggle:focus-visible{outline:3px solid rgba(56,189,248,.35);outline-offset:2px}
      .sp-outcome-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.sp-outcome-box{padding:13px;background:var(--sp-card-high);border-radius:9px}.sp-outcome-label{color:var(--sp-muted);font:700 11px "JetBrains Mono",monospace;text-transform:uppercase}.sp-outcome-value{font-size:28px;font-weight:800;color:white;margin-top:5px}.sp-progress{height:12px;border-radius:99px;background:var(--sp-card-top);overflow:hidden;margin:14px 0 6px}.sp-progress i{display:block;height:100%;border-radius:99px}.sp-confidence,.sp-recommendation{padding:11px 12px;border-radius:8px;background:var(--sp-card-high);color:var(--sp-muted);font-size:13px;line-height:1.5;margin-top:12px}.sp-confidence strong,.sp-recommendation strong{color:white}.sp-recommendation{border-left:3px solid var(--sp-teal)}
      .sp-chart{height:350px;background:#050a13;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:12px;overflow:hidden}.sp-chart svg{width:100%;height:100%;overflow:visible}.sp-gridline{stroke:#1e293b;stroke-width:1}.sp-axis{fill:#7c8ca3;font:12px "JetBrains Mono",monospace}.sp-chart-legend{display:flex;gap:16px;flex-wrap:wrap;color:var(--sp-muted);font-size:13px;margin-top:11px}.sp-chart-legend i{display:inline-block;width:16px;height:3px;margin-right:6px;vertical-align:middle}.sp-residual{display:grid;grid-template-columns:1fr repeat(3,auto);gap:14px;align-items:center;padding:11px 12px;background:var(--sp-shell);border-radius:8px;margin-top:12px;color:var(--sp-muted);font:12px "JetBrains Mono",monospace}.sp-residual b{color:white}.sp-importance{display:grid;gap:10px}.sp-importance-row{display:grid;grid-template-columns:minmax(210px,1fr) 2fr 56px;gap:10px;align-items:center;font-size:13px}.sp-importance-row b{font-weight:650;color:var(--sp-text)}.sp-importance-track{height:9px;border-radius:99px;background:var(--sp-card-top);overflow:hidden}.sp-importance-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--sp-purple),var(--sp-cyan))}.sp-importance-row span{font:700 12px "JetBrains Mono",monospace;color:var(--sp-cyan);text-align:right}.sp-risk-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.sp-risk-item{padding:11px 12px;border:1px solid var(--sp-line);background:var(--sp-shell);border-radius:8px}.sp-risk-top,.sp-risk-bottom{display:flex;justify-content:space-between;gap:10px}.sp-risk-top b{color:white;font-size:13px}.sp-risk-top span{font:700 12px "JetBrains Mono",monospace}.sp-risk-bottom{color:var(--sp-muted);font-size:12px;margin-top:5px}.sp-academic{border-left:3px solid var(--sp-cyan);background:linear-gradient(90deg,rgba(14,116,144,.12),var(--sp-card))}.sp-academic p{color:var(--sp-muted);font-size:14px;line-height:1.6}.sp-academic strong{color:white}
      #sp-toasts{position:fixed;right:18px;bottom:18px;z-index:2200;display:grid;gap:8px;max-width:420px}.sp-toast{background:var(--sp-card-high);border:1px solid rgba(56,189,248,.35);color:var(--sp-text);padding:11px 14px;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55);font:600 13px/1.5 "JetBrains Mono",monospace}.sp-toast.error{border-color:rgba(248,113,113,.5);color:#fecaca}.sp-modal-backdrop{position:fixed;inset:0;z-index:2100;background:rgba(2,6,12,.78);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px}.sp-modal{width:min(700px,100%);max-height:85vh;overflow:auto;background:var(--sp-card);border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:20px;color:var(--sp-text);box-shadow:0 24px 90px rgba(0,0,0,.65)}.sp-modal h2{font-size:21px;margin:0 0 9px}.sp-modal p{font-size:14px;line-height:1.6;color:var(--sp-muted)}.sp-modal table{width:100%;border-collapse:collapse;margin-top:12px}.sp-modal th,.sp-modal td{padding:10px;text-align:left;border-bottom:1px solid var(--sp-line);font-size:13px}.sp-modal th{color:var(--sp-muted)}.sp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}
      @media(max-width:1600px){html{font-size:18px!important}aside{width:250px!important}body>div.pl-72{padding-left:250px!important}body>div.pl-72>header{left:250px!important}.sp-kpis{grid-template-columns:repeat(3,1fr)}.sp-chart{height:325px}}
      @media(max-width:1180px){aside{transform:translateX(-100%)}body>div.pl-72{padding-left:0!important}body>div.pl-72>header{left:0!important}.sp-workspace{grid-template-columns:1fr}.sp-kpis{grid-template-columns:repeat(2,1fr)}.sp-hero{align-items:flex-start;flex-direction:column}.sp-actions{justify-content:flex-start}}
      @media(max-width:680px){.sp-kpis,.sp-risk-grid,.sp-outcome-grid{grid-template-columns:1fr}.sp-model-tabs{flex-wrap:wrap}.sp-training-strip{align-items:flex-start;flex-direction:column}.sp-training-meta{white-space:normal;flex-wrap:wrap}.sp-importance-row{grid-template-columns:1fr 1.5fr 48px}.sp-residual{grid-template-columns:1fr 1fr}.sp-chart{height:285px}}
      aside nav a[aria-current="page"] span{color:#f8fafc!important}aside nav a[aria-current="page"] .material-symbols-outlined{color:#67e8f9!important}
    `;
    document.head.appendChild(style);
    const toasts = document.createElement("div"); toasts.id = "sp-toasts"; document.body.appendChild(toasts);
  }

  function toast(message, error = false) {
    const item = document.createElement("div"); item.className = `sp-toast${error ? " error" : ""}`; item.textContent = message;
    document.querySelector("#sp-toasts").appendChild(item); setTimeout(() => item.remove(), 4200);
  }

  function modal(title, body, actions = []) {
    const backdrop = document.createElement("div"); backdrop.className = "sp-modal-backdrop";
    backdrop.innerHTML = `<section class="sp-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div>${body}</div><div class="sp-modal-actions"></div></section>`;
    const bar = backdrop.querySelector(".sp-modal-actions");
    [...actions, { label: "Close" }].forEach((action) => { const button = document.createElement("button"); button.className = `sp-btn${action.primary ? " primary" : ""}`; button.textContent = action.label; button.onclick = async () => { if (action.run) await action.run(backdrop); backdrop.remove(); }; bar.appendChild(button); });
    backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); }; document.body.appendChild(backdrop); return backdrop;
  }

  function download(url) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }

  function wireNavigation() {
    document.querySelectorAll("aside nav a[data-path]").forEach((anchor) => {
      const path = anchor.dataset.path; anchor.href = ROUTES[path] || "#"; const active = path === "demand-prediction";
      if (active) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current"); anchor.classList.toggle("bg-primary-container", active); anchor.classList.toggle("text-on-primary-container", active); anchor.classList.toggle("font-semibold", active); anchor.classList.toggle("text-on-surface-variant", !active);
      if (!active) anchor.classList.remove("shadow-[0_0_16px_rgba(6,182,212,0.25)]");
    });
    const context = byText("body > div.pl-72 > header span", "Executive Overview"); if (context) context.textContent = "Demand Prediction";
    const collapse = byText("aside span", "Collapse Dock")?.parentElement; if (collapse) collapse.onclick = () => { const aside = document.querySelector("aside"); aside.dataset.collapsed = String(aside.dataset.collapsed !== "true"); };
  }

  function wireGlobalControls() {
    const header = document.querySelector("body > div.pl-72 > header");
    const makeControl = (label, openDialog) => {
      const text = byText("span", label, header); const control = text?.parentElement;
      if (!control) return;
      control.setAttribute("role", "button"); control.setAttribute("tabindex", "0"); control.style.cursor = "pointer";
      control.setAttribute("aria-label", label);
      control.onclick = openDialog;
      control.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDialog(); } };
    };
    makeControl("All 20 Zones", () => modal("Municipal zone scope", `<p>This studio covers all ${fmt(state.overview.kpis.zones)} monitored Mumbai MMR parking zones. Select a target facility in the simulator, or inspect every live location on the geospatial map.</p>`, [{ label: "Open parking map", primary: true, run: () => { window.location.href = ROUTES["parking-map"]; } }]));
    makeControl("Live Window", () => modal("Prediction evidence window", "<p>The simulator uses the latest operational inputs. The comparison chart shows the most recent 24 hours of observed targets and forecasts; residual metrics are calculated only from the held-out validation subset.</p>", [{ label: "Open historical analytics", primary: true, run: () => { window.location.href = ROUTES["historical-analytics"]; } }]));
  }

  function updateChrome() {
    const header = document.querySelector("body > div.pl-72 > header"); const k = state.overview.kpis;
    const allZones = byText("span", "All 20 Zones", header); if (allZones) allZones.textContent = `All ${k.zones} Zones (Mumbai MMR)`;
    const rate = byText("span", "ev/s", header); if (rate) rate.textContent = `${fmt(k.events_per_second, 2)} ev/s`;
    const clock = [...header.querySelectorAll("span")].find((node) => /^\d{2}:\d{2}:\d{2} IST$/.test(clean(node.textContent))); if (clock) clock.textContent = `${new Date(state.overview.updated_at || Date.now()).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })} IST`;
    const side = byText("aside span", "OK"); if (side) side.textContent = state.health.kafka && state.health.spark ? "OK" : "DEGRADED";
    const alerts = header.querySelector('button[aria-label="Alerts"]'); if (alerts) alerts.onclick = () => modal("Inference service status", `<p>Model artifact: <strong>${esc(state.model.status)}</strong><br>Kafka: <strong>${state.health.kafka ? "healthy" : "offline"}</strong><br>Spark: <strong>${state.health.spark ? "streaming" : "offline"}</strong></p>`);
  }

  function buildPage() {
    const metrics = state.predictions.metrics;
    const zoneOptions = state.overview.zones.map((zone) => `<option value="${esc(zone.zone_id)}">${esc(zone.zone_id)} — ${esc(zone.zone_name)} (${fmt(zone.capacity)} bays)</option>`).join("");
    const cards = [
      ["verified", "R² coefficient", fmt(metrics.r2, 3), "Held-out variance explained", "cyan"],
      ["check_circle", "MAE error", `${fmt(metrics.mae, 2)} bays`, "Average absolute error", "green"],
      ["square_foot", "RMSE dispersion", `${fmt(metrics.rmse, 2)} bays`, "Penalizes larger misses", "cyan"],
      ["schedule", "Lookahead horizon", "30 min", "Forward demand interval", ""],
      ["dataset", "Training sample", fmt(state.model.training_rows), "Typed analytical rows", ""],
    ];
    document.querySelector("main > div").innerHTML = `
      <div class="sp-page">
        <section class="sp-hero"><div><div class="sp-eyebrow"><span>${esc(state.model.inference_engine)}</span><span>MODEL-${esc(state.model.version)}</span><span class="sp-live-pill">${esc(state.model.status.replaceAll("_", " "))}</span></div><h1>Random Forest Demand Prediction Studio</h1><p>Forecast parking occupancy 30 minutes ahead, test operational scenarios, and inspect model evidence across Mumbai's monitored parking zones.</p></div><div class="sp-actions"><div class="sp-model-tabs" aria-label="Model catalogue"><button class="active" data-model="Random Forest v3.2">RF v3.2</button><button data-model="XGBoost v1.8">XGBoost v1.8</button><button data-model="Linear Baseline">Linear baseline</button></div><button class="sp-btn" id="sp-export-model">Export model</button><button class="sp-btn primary" id="sp-benchmark">Run benchmark</button></div></section>
        <section class="sp-training-strip"><span><strong>${state.model.artifact_available ? "Production artifact" : "Hybrid deployment"}:</strong> ${state.model.artifact_available ? "trained model loaded" : "portable inference active; saved Random Forest validation retained"} for ${fmt(state.model.training_rows)} analytical rows from ${esc(String(state.model.training_start || "").slice(0, 10))} to ${esc(String(state.model.training_end || "").slice(0, 10))}.</span><div class="sp-training-meta"><span>Features: <b>${fmt(state.model.features.length)}</b></span><span>Validation: <b>${fmt(state.benchmark.samples)} rows</b></span><span>Target: <b>t + 30m</b></span></div></section>
        <section class="sp-kpis">${cards.map(([icon, label, value, note, tone]) => `<article class="sp-kpi"><div class="sp-kpi-head"><span>${esc(label)}</span><span class="material-symbols-outlined" style="color:var(--sp-${tone || "muted"})">${icon}</span></div><div class="sp-kpi-value ${tone}">${esc(value)}</div><div class="sp-kpi-note">${esc(note)}</div></article>`).join("")}</section>
        <section class="sp-workspace">
          <div class="sp-left">
            <article class="sp-card"><div class="sp-card-head"><div><h2>Interactive Demand Simulator</h2><p>Adjust operational inputs and run the trained model.</p></div><span class="sp-badge green">Typed feature contract</span></div>
              <div class="sp-section-label">Scenario presets</div><div class="sp-presets"><button class="sp-preset" data-preset="monsoon">Heavy monsoon</button><button class="sp-preset" data-preset="match">Wankhede match</button><button class="sp-preset" data-preset="festival">Diwali festival</button><button class="sp-preset" data-preset="weekday">Weekday evening</button></div>
              <label class="sp-field"><span class="sp-field-head"><span>Target municipal zone</span><output id="sp-capacity-label"></output></span><select class="sp-select" id="sp-zone">${zoneOptions}</select></label>
              ${slider("hour", "Simulation hour", 0, 23, new Date().getHours(), "00:00", "23:00")}
              <div class="sp-field"><span class="sp-field-head"><span>Day of week</span><output id="sp-day-label"></output></span><div class="sp-days">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => `<button class="sp-day${index === state.selectedDay ? " active" : ""}" data-day="${index}">${day}</button>`).join("")}</div></div>
              ${slider("rainfall", "Rainfall", 0, 80, 0, "Dry", "80 mm")}${slider("temperature", "Temperature", 10, 45, Math.round(state.overview.weather.temperature || 29), "10°C", "45°C")}${slider("occupancy", "Current occupancy", 0, 100, 50, "Empty", "Capacity")}${slider("dwell", "Average dwell", 5, 240, 75, "5 min", "240 min")}
              <label class="sp-toggle-row"><span><strong>Commercial event factor</strong><br><span style="color:var(--sp-muted)">Public holiday or major venue event</span></span><input class="sp-toggle" id="sp-event" type="checkbox"></label>
              <button class="sp-btn primary" id="sp-infer" style="width:100%;margin-top:16px">Run ML inference</button>
            </article>
            <article class="sp-card" id="sp-outcome"><div class="sp-card-head"><div><h2>Projected Saturation Outcome</h2><p>Thirty-minute capacity projection.</p></div><span class="sp-badge" id="sp-risk-badge">Awaiting inference</span></div><div id="sp-result"><div style="color:var(--sp-muted);padding:18px 0">Preparing the first live scenario…</div></div></article>
          </div>
          <div class="sp-right">
            <article class="sp-card"><div class="sp-card-head"><div><h2>24-Hour Occupancy: Actual vs Forecast</h2><p>Recent observed targets and Random Forest estimates; metrics use the held-out validation subset.</p></div><span class="sp-badge" id="sp-chart-zone"></span></div><div class="sp-chart" id="sp-forecast-chart"></div><div class="sp-chart-legend"><span><i style="background:${COLORS.cyan}"></i>Actual occupancy</span><span><i style="background:${COLORS.green}"></i>RF prediction</span><span><i style="background:rgba(167,139,250,.55);height:9px"></i>95% confidence band</span></div><div class="sp-residual" id="sp-residual"></div></article>
            <article class="sp-card"><div class="sp-card-head"><div><h2>Tree-Split Feature Importance</h2><p>Normalized contribution of every production feature.</p></div><span class="sp-badge">Σ = 100%</span></div><div class="sp-importance" id="sp-importance"></div></article>
            <article class="sp-card"><div class="sp-card-head"><div><h2>Cross-Metropolitan Saturation Risk</h2><p>Latest thirty-minute projection across all monitored zones.</p></div><span class="sp-badge" id="sp-risk-count"></span></div><div class="sp-risk-grid" id="sp-risk-grid"></div></article>
            <article class="sp-card sp-academic"><div class="sp-card-head"><div><h2>Academic Viva & ML Architecture Reference</h2><p>Evidence backed by the deployed artifact and current validation sample.</p></div><button class="sp-btn" id="sp-model-card">Open model card</button></div><p><strong>Random Forest regression</strong> aggregates independently trained decision trees to reduce variance. The production feature contract combines time, weather, live occupancy, capacity, and dwell signals; the dashboard reports held-out MAE, RMSE, R², feature importance, and bounded 30-minute predictions.</p></article>
          </div>
        </section>
      </div>`;
  }

  function slider(id, label, min, max, value, low, high) {
    return `<label class="sp-field"><span class="sp-field-head"><span>${esc(label)}</span><output id="sp-${id}-value">${esc(value)}</output></span><input class="sp-slider" id="sp-${id}" type="range" min="${min}" max="${max}" value="${value}"><span class="sp-scale"><span>${esc(low)}</span><span>${esc(high)}</span></span></label>`;
  }

  function zone() { return state.overview.zones.find((item) => item.zone_id === state.selectedZone) || state.overview.zones[0]; }

  function syncInputs() {
    const current = zone();
    document.querySelector("#sp-capacity-label").textContent = `Max ${fmt(current.capacity)} bays`;
    const occupancy = document.querySelector("#sp-occupancy"); occupancy.max = current.capacity;
    if (Number(occupancy.value) > current.capacity || !state.result) occupancy.value = current.occupancy;
    document.querySelector("#sp-occupancy-value").textContent = `${fmt(occupancy.value)} / ${fmt(current.capacity)}`;
    document.querySelector("#sp-day-label").textContent = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][state.selectedDay];
    document.querySelector("#sp-hour-value").textContent = `${String(document.querySelector("#sp-hour").value).padStart(2, "0")}:00`;
    document.querySelector("#sp-rainfall-value").textContent = `${document.querySelector("#sp-rainfall").value} mm`;
    document.querySelector("#sp-temperature-value").textContent = `${document.querySelector("#sp-temperature").value}°C`;
    document.querySelector("#sp-dwell-value").textContent = `${document.querySelector("#sp-dwell").value} min`;
  }

  function wireInputs() {
    const zoneSelect = document.querySelector("#sp-zone"); zoneSelect.value = state.selectedZone;
    zoneSelect.onchange = async () => { state.selectedZone = zoneSelect.value; state.result = null; syncInputs(); await loadZoneSeries(); await runInference(); };
    ["hour", "rainfall", "temperature", "occupancy", "dwell"].forEach((id) => document.querySelector(`#sp-${id}`).oninput = syncInputs);
    document.querySelectorAll(".sp-day").forEach((button) => button.onclick = () => { state.selectedDay = Number(button.dataset.day); document.querySelectorAll(".sp-day").forEach((item) => item.classList.toggle("active", item === button)); syncInputs(); });
    document.querySelectorAll(".sp-preset").forEach((button) => button.onclick = () => applyPreset(button.dataset.preset, button));
    document.querySelector("#sp-infer").onclick = runInference;
    syncInputs();
  }

  function applyPreset(name, button) {
    const current = zone();
    const values = {
      monsoon: { hour: 18, rainfall: 42, temperature: 25, occupancy: Math.round(current.capacity * .72), dwell: 105, event: false },
      match: { hour: 19, rainfall: 0, temperature: 30, occupancy: Math.round(current.capacity * .82), dwell: 140, event: true },
      festival: { hour: 20, rainfall: 2, temperature: 29, occupancy: Math.round(current.capacity * .88), dwell: 165, event: true },
      weekday: { hour: 18, rainfall: 0, temperature: 31, occupancy: Math.round(current.capacity * .62), dwell: 80, event: false },
    }[name];
    Object.entries(values).forEach(([key, value]) => { const input = document.querySelector(`#sp-${key}`); if (input) input[key === "event" ? "checked" : "value"] = value; });
    document.querySelectorAll(".sp-preset").forEach((item) => item.classList.toggle("active", item === button)); syncInputs(); toast(`${clean(button.textContent)} scenario loaded`);
  }

  async function runInference() {
    const button = document.querySelector("#sp-infer"); const current = zone();
    const payload = { zone: state.selectedZone, capacity: current.capacity, hour: Number(document.querySelector("#sp-hour").value), day_of_week: state.selectedDay, temperature: Number(document.querySelector("#sp-temperature").value), rainfall: Number(document.querySelector("#sp-rainfall").value), current_occupancy: Number(document.querySelector("#sp-occupancy").value), average_duration: Number(document.querySelector("#sp-dwell").value), is_holiday: document.querySelector("#sp-event").checked };
    try { button.disabled = true; button.textContent = "Running inference…"; state.result = await api("/api/predict", { method: "POST", body: JSON.stringify(payload) }); renderOutcome(); toast(`Thirty-minute forecast completed · ${state.result.model_engine}`); }
    catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Run ML inference"; }
  }

  function renderOutcome() {
    const result = state.result; if (!result) return; const color = result.risk === "HIGH" ? COLORS.red : result.risk === "MEDIUM" ? COLORS.amber : COLORS.green;
    const badge = document.querySelector("#sp-risk-badge"); badge.textContent = `${result.risk} risk`; badge.className = `sp-badge ${result.risk === "HIGH" ? "red" : result.risk === "MEDIUM" ? "amber" : "green"}`;
    const recommendation = result.recommended_zone;
    document.querySelector("#sp-result").innerHTML = `<div class="sp-outcome-grid"><div class="sp-outcome-box"><div class="sp-outcome-label">Projected occupancy</div><div class="sp-outcome-value" style="color:${color}">${fmt(result.predicted_occupancy, 1)} <small style="font-size:13px;color:var(--sp-muted)">/ ${fmt(result.capacity)}</small></div></div><div class="sp-outcome-box"><div class="sp-outcome-label">Available bays</div><div class="sp-outcome-value">${fmt(result.available, 1)}</div></div></div><div class="sp-progress"><i style="width:${Math.min(100, result.utilization)}%;background:${color}"></i></div><div class="sp-scale"><span>0% occupancy</span><span style="color:${color}">${fmt(result.utilization, 1)}% projected</span></div><div class="sp-confidence"><strong>Inference engine:</strong> ${esc(result.model_engine)}<br><strong>95% confidence interval:</strong> ${fmt(result.confidence_low, 1)} to ${fmt(result.confidence_high, 1)} occupied bays. Expected net change: <strong>${result.net_change >= 0 ? "+" : ""}${fmt(result.net_change, 1)}</strong>.</div>${recommendation ? `<div class="sp-recommendation"><strong>Dispatch option:</strong> divert overflow toward ${esc(recommendation.zone_id)} ${esc(recommendation.zone_name)}, currently reporting ${fmt(recommendation.available)} available bays.</div>` : ""}`;
  }

  async function loadZoneSeries() {
    try { state.predictions = await api(`/api/predictions?zone=${encodeURIComponent(state.selectedZone)}`); renderForecast(); }
    catch (error) { toast(`Forecast series unavailable: ${error.message}`, true); }
  }

  function renderForecast() {
    const rows = state.predictions.series.slice(-48); const target = document.querySelector("#sp-forecast-chart"); document.querySelector("#sp-chart-zone").textContent = state.selectedZone;
    if (!rows.length) { target.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:var(--sp-muted)">No prediction observations are available for this zone.</div>'; return; }
    const actualKey = rows[0]?.actual_occupancy !== undefined ? "actual_occupancy" : "current_occupancy";
    const width = 1000, height = 320, left = 58, right = 18, top = 20, bottom = 40; const capacity = Math.max(...rows.map((row) => Number(row.capacity || 1))); const max = Math.max(capacity, ...rows.flatMap((row) => [Number(row[actualKey] || 0), Number(row.predicted_occupancy || 0)]));
    const x = (index) => left + index / Math.max(1, rows.length - 1) * (width - left - right); const y = (value) => top + (max - value) / Math.max(1, max) * (height - top - bottom); const interval = Math.max(1, Number(state.predictions.metrics.rmse || 0) * 1.96);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
    for (let i = 0; i < 5; i++) { const yy = top + i * (height - top - bottom) / 4; svg += `<line class="sp-gridline" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text class="sp-axis" x="4" y="${yy + 4}">${fmt(max - i * max / 4, 0)}</text>`; }
    const upper = rows.map((row, index) => `${x(index)},${y(Math.min(max, Number(row.predicted_occupancy) + interval))}`).join(" "); const lower = rows.map((row, index) => `${x(rows.length - 1 - index)},${y(Math.max(0, Number(rows[rows.length - 1 - index].predicted_occupancy) - interval))}`).join(" ");
    svg += `<polygon points="${upper} ${lower}" fill="rgba(167,139,250,.14)"/>`;
    [[actualKey, COLORS.cyan], ["predicted_occupancy", COLORS.green]].forEach(([key, color]) => { const points = rows.map((row, index) => `${x(index)},${y(Number(row[key] || 0))}`).join(" "); svg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke"/>`; });
    const first = new Date(rows[0].timestamp), last = new Date(rows.at(-1).timestamp); svg += `<text class="sp-axis" x="${left}" y="${height - 8}">${first.toLocaleString("en-IN", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</text><text class="sp-axis" text-anchor="end" x="${width - right}" y="${height - 8}">${last.toLocaleString("en-IN", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</text></svg>`; target.innerHTML = svg;
    document.querySelector("#sp-residual").innerHTML = `<span>Held-out residual evidence</span><span>MAE <b>${fmt(state.predictions.metrics.mae, 2)}</b></span><span>RMSE <b>${fmt(state.predictions.metrics.rmse, 2)}</b></span><span>R² <b>${fmt(state.predictions.metrics.r2, 3)}</b></span>`;
  }

  function renderImportance() {
    const values = state.predictions.importance; const max = Math.max(...values.map((item) => Number(item.importance)), 1);
    document.querySelector("#sp-importance").innerHTML = values.map((item, index) => `<div class="sp-importance-row"><b>${index + 1}. ${esc(item.feature.replaceAll("_", " "))}</b><div class="sp-importance-track"><i style="width:${Number(item.importance) / max * 100}%"></i></div><span>${fmt(Number(item.importance) * 100, 1)}%</span></div>`).join("");
  }

  function renderRiskMatrix() {
    const rows = state.overview.zones.map((item) => {
      const predicted = Number(item.forecast_occupancy_30m ?? item.occupancy);
      const utilization = Number(item.forecast_utilization_30m ?? (item.capacity ? predicted / item.capacity * 100 : 0));
      return { ...item, predicted, projectedUtilization: utilization };
    }).sort((a, b) => b.projectedUtilization - a.projectedUtilization).slice(0, 10);
    const critical = rows.filter((row) => row.projectedUtilization >= 85).length; document.querySelector("#sp-risk-count").textContent = `${critical} critical / ${rows.length} shown`;
    document.querySelector("#sp-risk-grid").innerHTML = rows.map((row) => { const risk = row.projectedUtilization >= 85 ? "CRITICAL" : row.projectedUtilization >= 60 ? "MODERATE" : "NORMAL"; const color = risk === "CRITICAL" ? COLORS.red : risk === "MODERATE" ? COLORS.amber : COLORS.green; return `<div class="sp-risk-item"><div class="sp-risk-top"><b><span style="color:${COLORS.cyan};font-family:'JetBrains Mono',monospace">${esc(row.zone_id)}</span> ${esc(row.zone_name)}</b><span style="color:${color}">${fmt(row.projectedUtilization, 1)}%</span></div><div class="sp-risk-bottom"><span>${fmt(row.predicted, 0)} / ${fmt(row.capacity)} projected</span><span style="color:${color}">${risk}</span></div></div>`; }).join("");
  }

  function wireActions() {
    document.querySelectorAll("[data-model]").forEach((button) => button.onclick = () => {
      if (button.dataset.model === "Random Forest v3.2") return toast(state.model.artifact_available ? "Random Forest v3.2 is the active production model" : "Random Forest validation evidence is active; interactive scenarios use the portable fallback");
      const candidate = state.model.candidates.find((item) => item.name === button.dataset.model);
      modal(candidate.name, `<p>Status: <strong>${esc(candidate.status.toUpperCase())}</strong></p><p>${esc(candidate.purpose)}. This candidate remains isolated from production inference; use the benchmark to compare the deployed model against its explainable baseline.</p>`);
    });
    document.querySelector("#sp-benchmark").onclick = runBenchmark;
    document.querySelector("#sp-model-card").onclick = showModelCard;
    document.querySelector("#sp-export-model").onclick = showExport;
  }

  function showBenchmark() {
    const rows = state.benchmark.models.map((model) => `<tr><td><strong>${esc(model.name)}</strong><br><span style="color:var(--sp-muted)">${esc(model.status)}</span></td><td>${fmt(model.mae, 3)}</td><td>${fmt(model.rmse, 3)}</td><td>${fmt(model.r2, 3)}</td></tr>`).join("");
    modal("Held-out Model Benchmark", `<p>Comparison over ${fmt(state.benchmark.samples)} saved validation predictions. Lower MAE/RMSE and higher R² indicate better fit.</p><table><thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>R²</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  async function runBenchmark() {
    const button = document.querySelector("#sp-benchmark");
    try {
      button.disabled = true; button.textContent = "Running benchmarkâ€¦";
      state.benchmark = await api(`/api/model/benchmark?zone=${encodeURIComponent(state.selectedZone)}`);
      showBenchmark();
    } catch (error) { toast(`Benchmark failed: ${error.message}`, true); }
    finally { button.disabled = false; button.textContent = "Run benchmark"; }
  }

  function showModelCard() {
    modal(state.model.name, `<p><strong>${esc(state.model.version)} · ${esc(state.model.status)}</strong></p><table><tbody><tr><th>Framework</th><td>${esc(state.model.framework)}</td></tr><tr><th>Prediction target</th><td>${esc(state.model.target)} at t + ${fmt(state.model.horizon_minutes)} minutes</td></tr><tr><th>Training rows</th><td>${fmt(state.model.training_rows)}</td></tr><tr><th>Features</th><td>${esc(state.model.features.join(", "))}</td></tr><tr><th>Risk thresholds</th><td>Low ${esc(state.model.risk_thresholds.low)}, Medium ${esc(state.model.risk_thresholds.medium)}, High ${esc(state.model.risk_thresholds.high)}</td></tr></tbody></table>`);
  }

  function showExport() {
    const dialog = modal("Export Production Model Metadata", `<p>Download a machine-readable model card or a PMML interoperability manifest for the deployed Random Forest artifact.</p><div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px"><button class="sp-btn primary" id="sp-json-export">Model card JSON</button><button class="sp-btn" id="sp-pmml-export">PMML manifest</button></div>`);
    dialog.querySelector("#sp-json-export").onclick = () => { download("/api/model/export?format=json"); toast("Model card JSON prepared"); };
    dialog.querySelector("#sp-pmml-export").onclick = () => { download("/api/model/export?format=pmml"); toast("PMML manifest prepared"); };
  }

  async function boot() {
    installStyles(); wireNavigation();
    try {
      const [overview, health, predictions, model, benchmark] = await Promise.all([api("/api/overview"), api("/api/health"), api("/api/predictions?zone=ALL"), api("/api/model-card"), api("/api/model/benchmark?zone=ALL")]);
      state.overview = overview; state.health = health; state.predictions = predictions; state.model = model; state.benchmark = benchmark;
      state.selectedZone = [...overview.zones].sort((a, b) => b.utilization - a.utilization)[0]?.zone_id || overview.zones[0]?.zone_id;
      buildPage(); updateChrome(); wireGlobalControls(); wireInputs(); wireActions(); renderImportance(); renderRiskMatrix(); await loadZoneSeries(); await runInference(); document.body.dataset.smartparkPrediction = "ready";
    } catch (error) { toast(`Demand Prediction failed to initialize: ${error.message}`, true); console.error(error); }
  }

  boot();
})();
