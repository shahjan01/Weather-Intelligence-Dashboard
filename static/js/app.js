
"use strict";

const API = {
  weather: (q) => `/api/weather?q=${encodeURIComponent(q)}`,
  search: (q) => `/api/search?q=${encodeURIComponent(q)}`,
};

const LS = { favs: "skylign.favs", theme: "skylign.theme", notifs: "skylign.notifs" };
const DEFAULT_CITY = "Karachi";

const state = {
  data: null,
  query: null,
  favs: load(LS.favs, []),
  notifs: load(LS.notifs, []),
  charts: {},
};

/*tiny helpers */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/*condition → category + sky*/
function category(code) {
  if (code === 1000) return "clear";
  if ([1003].includes(code)) return "partly";
  if ([1006, 1009].includes(code)) return "cloudy";
  if ([1030, 1135, 1147].includes(code)) return "fog";
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return "storm";
  if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return "snow";
  if ([1069, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195,
       1198, 1201, 1204, 1207, 1240, 1243, 1246, 1249, 1252, 1261, 1264].includes(code)) return "rain";
  return "cloudy";
}

const SKY = {
  "clear-day":   ["#1c4fb0", "#3d82e6", "#0e2a5c", "120,180,255"],
  "clear-night": ["#0b1020", "#1a2350", "#070a16", "91,140,255"],
  "partly-day":  ["#22518f", "#4a86c9", "#163a66", "140,190,240"],
  "partly-night":["#101630", "#222c55", "#0a0e1c", "120,150,220"],
  "cloudy-day":  ["#3a4a63", "#5b6e8a", "#28323f", "150,170,200"],
  "cloudy-night":["#161b28", "#262f44", "#0d1016", "120,135,170"],
  "rain-day":    ["#2a3a55", "#3f567a", "#1c2638", "120,160,210"],
  "rain-night":  ["#10141f", "#1e293e", "#080a12", "90,130,190"],
  "storm-day":   ["#262b40", "#3a3360", "#15131f", "170,140,255"],
  "storm-night": ["#0d0e1a", "#221d3c", "#06060e", "150,120,240"],
  "snow-day":    ["#5a6f8c", "#8aa3c2", "#3c4a60", "200,220,255"],
  "snow-night":  ["#1a2030", "#2c3850", "#0e121c", "150,180,230"],
  "fog-day":     ["#4a5260", "#727b8a", "#343a44", "170,180,195"],
  "fog-night":   ["#141720", "#262a36", "#0a0c12", "120,130,150"],
};

function paintSky(code, isDay) {
  const key = `${category(code)}-${isDay ? "day" : "night"}`;
  const [s1, s2, s3, accent] = SKY[key] || SKY["clear-night"];
  const r = document.documentElement.style;
  r.setProperty("--sky-1", s1);
  r.setProperty("--sky-2", s2);
  r.setProperty("--sky-3", s3);
  r.setProperty("--sky-accent", accent);
}

/*inline SVG weather icons */
function icon(code, isDay = true, size = 64) {
  const cat = category(code);
  const A = css("--accent") || "#5b8cff";
  const W = css("--warm") || "#ffb86b";
  const M = css("--muted") || "#9aa6c7";
  const sun = `<circle cx="32" cy="30" r="13" fill="${W}"/>`;
  const moon = `<path d="M40 20a13 13 0 1 0 4 18 11 11 0 0 1-4-18z" fill="${M}"/>`;
  const cloud = (c, x = 0, y = 0) => `<path transform="translate(${x},${y})" d="M22 46h22a10 10 0 0 0 1-19.9A14 14 0 0 0 18 30 9 9 0 0 0 22 46z" fill="${c}"/>`;
  const wrap = (inner) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  switch (cat) {
    case "clear":
      return wrap(isDay ? sun : moon);
    case "partly":
      return wrap((isDay ? sun.replace('cx="32" cy="30"', 'cx="26" cy="24"') : moon) + cloud("#cdd6ee", 4, 6));
    case "cloudy":
      return wrap(cloud(M, -2, -2) + cloud("#e3e9fb", 6, 6));
    case "fog":
      return wrap(cloud("#c5ccdd", 0, -4) + `<g stroke="${M}" stroke-width="3" stroke-linecap="round"><line x1="16" y1="50" x2="46" y2="50"/><line x1="20" y1="56" x2="42" y2="56"/></g>`);
    case "rain":
      return wrap(cloud(M, 0, -6) + `<g stroke="${A}" stroke-width="3" stroke-linecap="round"><line x1="24" y1="48" x2="21" y2="56"/><line x1="33" y1="48" x2="30" y2="56"/><line x1="42" y1="48" x2="39" y2="56"/></g>`);
    case "storm":
      return wrap(cloud(M, 0, -6) + `<path d="M32 46l-7 9h6l-4 8 11-12h-6l4-5z" fill="${W}"/>`);
    case "snow":
      return wrap(cloud("#cdd6ee", 0, -6) + `<g fill="${A}"><circle cx="24" cy="52" r="2.4"/><circle cx="33" cy="56" r="2.4"/><circle cx="42" cy="52" r="2.4"/></g>`);
    default:
      return wrap(cloud(M));
  }
}

/*data fetch */
async function fetchWeather(q) {
  showLoader(true);
  setStatus(null);
  try {
    const res = await fetch(API.weather(q));
    const body = await res.json();
    if (!res.ok) { setStatus(body.message || "Could not load weather."); showLoader(false); return; }
    state.data = body;
    state.query = q;
    render(body);
  } catch (e) {
    setStatus("Network error reaching the server. Is Flask running?");
  } finally {
    showLoader(false);
  }
}

/*master render*/
function render(d) {
  const c = d.current, loc = d.location;
  paintSky(c.condition_code, c.is_day);

  // hero
  $("#heroPlace").textContent = [loc.name, loc.country].filter(Boolean).join(", ");
  $("#heroUpdated").textContent = "Updated " + (c.last_updated?.split(" ")[1] || "—") + " · local " + (loc.localtime?.split(" ")[1] || "");
  $("#heroIcon").innerHTML = icon(c.condition_code, c.is_day, 92);
  $("#heroTemp").textContent = Math.round(c.temp_c);
  $("#heroCond").textContent = c.condition_text || "—";
  $("#heroFeels").textContent = Math.round(c.feelslike_c) + "°";
  $("#heroHigh").textContent = Math.round(c.maxtemp_c) + "°";
  $("#heroLow").textContent = Math.round(c.mintemp_c) + "°";
  $("#heroRain").textContent = (c.chance_of_rain ?? 0) + "%";

  renderStats(c);
  renderHourly(d.forecast);
  renderWeek(d.forecast);
  renderCharts(d.forecast);
  renderAssistant(c);
  runAlerts(c, d.alerts);
  refreshFavStar();
}

/*stats grid*/
function renderStats(c) {
  const compass = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const uvLabel = c.uv >= 8 ? "Very high" : c.uv >= 6 ? "High" : c.uv >= 3 ? "Moderate" : "Low";
  const items = [
    { label: "Humidity", value: c.humidity, unit: "%", sub: c.humidity > 70 ? "Humid" : c.humidity < 30 ? "Dry" : "Comfortable" },
    { label: "Wind speed", value: Math.round(c.wind_kph), unit: " km/h", sub: c.wind_dir },
    { label: "Wind direction", value: c.wind_dir, unit: "", sub: c.wind_degree + "°" },
    { label: "Pressure", value: Math.round(c.pressure_mb), unit: " mb", sub: c.pressure_mb < 1000 ? "Low" : c.pressure_mb > 1020 ? "High" : "Normal" },
    { label: "Visibility", value: c.vis_km, unit: " km", sub: c.vis_km >= 10 ? "Clear" : "Reduced" },
    { label: "UV index", value: c.uv, unit: "", sub: uvLabel },
    { label: "Cloud cover", value: c.cloud, unit: "%", sub: c.cloud > 70 ? "Overcast" : c.cloud > 30 ? "Partly" : "Clear" },
    { label: "Air quality", value: c.aqi.epa_index || "—", unit: "", sub: c.aqi.label, dot: c.aqi.color },
    { label: "Dew point", value: c.dewpoint_c ?? "—", unit: "°", sub: c.dewpoint_c > 20 ? "Muggy" : "Pleasant" },
    { label: "Chance of rain", value: c.chance_of_rain ?? 0, unit: "%", sub: (c.chance_of_rain ?? 0) > 50 ? "Likely" : "Unlikely" },
  ];
  $("#statsGrid").innerHTML = items.map((s) => `
    <div class="stat">
      <span class="stat__label">${s.label}</span>
      <span class="stat__value">${s.value}<small>${s.unit}</small></span>
      <span class="stat__sub">${s.dot ? `<span class="stat__dot" style="background:${s.dot}"></span> ` : ""}${s.sub ?? ""}</span>
    </div>`).join("");
}

/*hourly (next 24h from now)*/
function flattenHours(forecast) {
  const all = forecast.flatMap((d) => d.hours);
  const now = Date.now();
  return all.filter((h) => new Date(h.time.replace(" ", "T")).getTime() >= now - 3.6e6).slice(0, 24);
}
function renderHourly(forecast) {
  const hours = flattenHours(forecast);
  const nowH = new Date().getHours();
  $("#hourly").innerHTML = hours.map((h, i) => {
    const hr = new Date(h.time.replace(" ", "T")).getHours();
    const label = i === 0 ? "Now" : `${((hr + 11) % 12) + 1}${hr < 12 ? "am" : "pm"}`;
    return `<div class="hour">
      <span class="hour__time ${i === 0 ? "now" : ""}">${label}</span>
      <span class="hour__icon">${icon(h.condition_code, h.is_day, 34)}</span>
      <span class="hour__temp">${Math.round(h.temp_c)}°</span>
      <span class="hour__rain">${h.chance_of_rain > 0 ? "💧" + h.chance_of_rain + "%" : "—"}</span>
    </div>`;
  }).join("");
}

/*7-day*/
function renderWeek(forecast) {
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const maxs = forecast.map((d) => d.maxtemp_c);
  const lo = Math.min(...forecast.map((d) => d.mintemp_c)), hi = Math.max(...maxs);
  $("#week").innerHTML = forecast.map((d, i) => {
    const dt = new Date(d.date + "T00:00:00");
    const name = i === 0 ? "Today" : names[dt.getDay()];
    const left = ((d.mintemp_c - lo) / (hi - lo || 1)) * 100;
    const width = ((d.maxtemp_c - d.mintemp_c) / (hi - lo || 1)) * 100;
    return `<div class="day">
      <span class="day__name">${name}</span>
      <span class="day__icon">${icon(d.condition_code, true, 30)}</span>
      <span class="day__bar"><span style="left:${left}%;width:${Math.max(width,8)}%"></span></span>
      <span class="day__temps">${Math.round(d.maxtemp_c)}° <span class="min">${Math.round(d.mintemp_c)}°</span> &nbsp;<span class="day__rain">💧${d.chance_of_rain}%</span></span>
    </div>`;
  }).join("");
}

/*charts*/
function baseChart(ctx, labels, datasets, yMax) {
  const grid = css("--grid-line"), muted = css("--muted");
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { display: datasets.length > 1, labels: { color: muted, boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { grid: { color: grid }, ticks: { color: muted, maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: grid }, ticks: { color: muted, font: { size: 10 } }, suggestedMax: yMax },
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { tension: 0.4, borderWidth: 2 } },
    },
  });
}
function fillArea(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00");
  return g;
}
function renderCharts(forecast) {
  Object.values(state.charts).forEach((c) => c?.destroy());
  const hours = flattenHours(forecast);
  const labels = hours.map((h) => { const hr = new Date(h.time.replace(" ", "T")).getHours(); return `${((hr + 11) % 12) + 1}${hr < 12 ? "a" : "p"}`; });
  const A = css("--accent"), A2 = css("--accent-2"), W = css("--warm");

  const tctx = $("#chartTemp").getContext("2d");
  state.charts.temp = baseChart(tctx, labels, [{ label: "Temp", data: hours.map((h) => h.temp_c), borderColor: W, backgroundColor: fillArea(tctx, W), fill: true }]);

  const rctx = $("#chartRain").getContext("2d");
  state.charts.rain = baseChart(rctx, labels, [{ label: "Rain %", data: hours.map((h) => h.chance_of_rain), borderColor: A2, backgroundColor: fillArea(rctx, A2), fill: true }], 100);

  const hctx = $("#chartHumid").getContext("2d");
  state.charts.humid = baseChart(hctx, labels, [{ label: "Humidity %", data: hours.map((h) => h.humidity), borderColor: A, backgroundColor: fillArea(hctx, A), fill: true }], 100);

  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const wlabels = forecast.map((d, i) => i === 0 ? "Today" : names[new Date(d.date + "T00:00:00").getDay()]);
  state.charts.week = baseChart($("#chartWeek").getContext("2d"), wlabels, [
    { label: "High", data: forecast.map((d) => d.maxtemp_c), borderColor: W },
    { label: "Low", data: forecast.map((d) => d.mintemp_c), borderColor: A },
  ]);
}

/* assistant (RULE-BASED — not an LLM)*/
function renderAssistant(c) {
  const tips = [];
  const t = c.temp_c, feels = c.feelslike_c;

  if (t >= 38) tips.push(["🥵", "Extreme heat. Stay indoors midday, drink water often, avoid strenuous activity."]);
  else if (t >= 30) tips.push(["☀️", "Hot day. Light, loose clothing and sunscreen. Keep hydrated."]);
  else if (t <= 8) tips.push(["🧥", "Cold out. Layer up and cover extremities before heading out."]);
  else tips.push(["👕", "Comfortable temperatures. A light layer should be enough."]);

  if ((c.chance_of_rain ?? 0) >= 60) tips.push(["☔", "Rain likely. Carry an umbrella and allow extra travel time."]);
  if (c.uv >= 8) tips.push(["🕶️", "Very high UV. Sunglasses, SPF 30+, and shade between 11am–3pm."]);
  if (c.wind_kph >= 40) tips.push(["💨", "Strong winds. Secure loose items; cycling and umbrellas will be tricky."]);
  if (c.aqi.epa_index >= 4) tips.push(["😷", `Air quality is ${c.aqi.label.toLowerCase()}. Limit outdoor exercise; mask if sensitive.`]);
  if (c.vis_km < 3) tips.push(["🌫️", "Low visibility. Drive slowly with headlights on."]);
  if (c.humidity >= 80 && t >= 26) tips.push(["💦", "Humid and warm. It'll feel hotter than it reads — pace yourself outdoors."]);

  // activity verdict
  const good = (c.chance_of_rain ?? 0) < 30 && c.wind_kph < 35 && c.aqi.epa_index < 4 && t >= 12 && t <= 32;
  tips.push(good
    ? ["🚶", "Good window for outdoor activity — walking, sport, or errands."]
    : ["🏠", "Conditions favour indoor plans right now."]);

  $("#assistantList").innerHTML = tips.map(([e, txt]) => `<li><span class="emoji">${e}</span><span>${txt}</span></li>`).join("");
}

/*alerts → notifications*/
function runAlerts(c, providerAlerts) {
  const fresh = [];
  const place = state.data?.location?.name || "";
  const push = (emoji, title, body) => fresh.push({ emoji, title: `${title} · ${place}`, body, time: Date.now(), unread: true });

  if (c.temp_c > 40) push("🔥", "Heat alert", "Temperature above 40°C. Avoid outdoor activity and stay hydrated.");
  if ((c.chance_of_rain ?? 0) > 70) push("🌧", "Rain alert", "High chance of rain. Carry an umbrella.");
  if (category(c.condition_code) === "storm") push("⛈", "Thunderstorm", "Storm conditions detected. Stay indoors and away from windows.");
  if (c.aqi.epa_index >= 4) push("😷", "Air quality alert", `AQI is ${c.aqi.label.toLowerCase()}. Wear a mask outdoors.`);
  if (c.wind_kph > 45) push("💨", "Strong wind", "High winds expected. Be careful outdoors.");
  (providerAlerts || []).forEach((a) => a.event && push("⚠️", a.event, (a.desc || a.headline || "").slice(0, 140)));

  // de-dupe against existing unread of same title within this session
  const existingTitles = new Set(state.notifs.map((n) => n.title));
  const added = fresh.filter((n) => !existingTitles.has(n.title));
  if (added.length) {
    state.notifs = [...added, ...state.notifs].slice(0, 40);
    save(LS.notifs, state.notifs);
  }
  renderNotifs();
}

function renderNotifs() {
  const list = $("#notifList");
  if (!state.notifs.length) {
    list.innerHTML = `<p class="notifs__empty">No alerts. Clear skies on the monitoring front.</p>`;
  } else {
    list.innerHTML = state.notifs.map((n) => `
      <div class="notif ${n.unread ? "unread" : ""}">
        <span class="emoji">${n.emoji}</span>
        <div>
          <p class="notif__title">${n.title}</p>
          <p class="notif__body">${n.body}</p>
          <p class="notif__time">${new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>`).join("");
  }
  const unread = state.notifs.filter((n) => n.unread).length;
  const badge = $("#bellBadge");
  badge.textContent = unread;
  badge.hidden = unread === 0;
}

/*favorites*/
function refreshFavStar() {
  const here = state.data?.location?.name;
  $("#favToggle").classList.toggle("active", state.favs.some((f) => f.name === here));
}
function renderFavs() {
  const wrap = $("#favs");
  if (!state.favs.length) { wrap.innerHTML = `<p class="favs__empty">No saved cities yet. Tap the ★ on the hero card.</p>`; return; }
  wrap.innerHTML = state.favs.map((f) => `
    <div class="fav" data-q="${f.name}">
      <div><span class="fav__name">${f.name}</span></div>
      <span class="fav__temp">${f.country || ""}</span>
      <button class="fav__rm" data-rm="${f.name}" aria-label="Remove ${f.name}">×</button>
    </div>`).join("");
}
function toggleFav() {
  const loc = state.data?.location; if (!loc) return;
  const i = state.favs.findIndex((f) => f.name === loc.name);
  if (i >= 0) state.favs.splice(i, 1);
  else state.favs.unshift({ name: loc.name, country: loc.country });
  save(LS.favs, state.favs);
  renderFavs(); refreshFavStar();
}

/* search*/
const doSearch = debounce(async (q) => {
  const box = $("#searchResults");
  if (q.length < 2) { box.classList.remove("open"); return; }
  try {
    const res = await fetch(API.search(q));
    const items = await res.json();
    if (!Array.isArray(items) || !items.length) { box.classList.remove("open"); return; }
    box.innerHTML = items.map((it) =>
      `<li role="option" data-q="${it.lat},${it.lon}">${it.name}<small>${[it.region, it.country].filter(Boolean).join(", ")}</small></li>`).join("");
    box.classList.add("open");
  } catch { box.classList.remove("open"); }
}, 260);

/* geolocation */
function locate() {
  if (!navigator.geolocation) { fetchWeather(DEFAULT_CITY); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeather(`${pos.coords.latitude},${pos.coords.longitude}`),
    () => { setStatus("Location blocked — showing " + DEFAULT_CITY + ". Use search for any city."); fetchWeather(DEFAULT_CITY); },
    { timeout: 8000 }
  );
}

/*ui plumbing */
function showLoader(on) { $("#loader").classList.toggle("hide", !on); }
function setStatus(msg) { const b = $("#statusBar"); if (!msg) { b.hidden = true; return; } b.textContent = msg; b.hidden = false; }
function openNotifs(open) { $("#notifPanel").classList.toggle("open", open); $("#scrim").hidden = !open; $("#notifPanel").setAttribute("aria-hidden", String(!open)); }

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  save(LS.theme, theme);
  if (state.data) renderCharts(state.data.forecast); // recolor charts
}

function bind() {
  $("#searchInput").addEventListener("input", (e) => doSearch(e.target.value.trim()));
  $("#searchResults").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-q]"); if (!li) return;
    $("#searchResults").classList.remove("open");
    $("#searchInput").value = li.firstChild.textContent;
    fetchWeather(li.dataset.q);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#searchWrap")) $("#searchResults").classList.remove("open"); });

  $("#locateBtn").addEventListener("click", locate);
  $("#themeBtn").addEventListener("click", () =>
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  $("#bellBtn").addEventListener("click", () => openNotifs(true));
  $("#notifClose").addEventListener("click", () => openNotifs(false));
  $("#scrim").addEventListener("click", () => openNotifs(false));
  $("#markReadBtn").addEventListener("click", () => {
    state.notifs = state.notifs.map((n) => ({ ...n, unread: false }));
    save(LS.notifs, state.notifs); renderNotifs();
  });

  $("#favToggle").addEventListener("click", toggleFav);
  $("#favs").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) { state.favs = state.favs.filter((f) => f.name !== rm.dataset.rm); save(LS.favs, state.favs); renderFavs(); refreshFavStar(); return; }
    const f = e.target.closest(".fav[data-q]"); if (f) fetchWeather(f.dataset.q);
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { openNotifs(false); $("#searchResults").classList.remove("open"); } });

  setInterval(() => { $("#footClock").textContent = new Date().toLocaleTimeString(); }, 1000);
}

/*boot  */
function init() {
  applyTheme(load(LS.theme, "dark"));
  bind();
  renderFavs();
  renderNotifs();
  locate();
}
document.addEventListener("DOMContentLoaded", init);
