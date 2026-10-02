document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     GIS tools: tabs
     ========================================================= */
  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  function selectTab(tab) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next); next.focus();
    });
  });

  const $ = (id) => document.getElementById(id);
  const num = (id) => { const v = $(id).value; return v === "" ? NaN : Number(v); };
  const show = (id, html, bad = false) => { const el = $(id); el.innerHTML = html; el.classList.toggle("bad", bad); };

  /* =========================================================
     Tool 1: coordinate converter
     ========================================================= */
  function toDMS(value, isLat) {
    const dir = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    let abs = Math.abs(value);
    let d = Math.floor(abs);
    let m = Math.floor((abs - d) * 60);
    let s = Math.round(((abs - d) * 60 - m) * 60 * 100) / 100;
    if (s >= 60) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return `${d}° ${m}′ ${s.toFixed(2)}″ ${dir}`;
  }
  function updateDD() {
    const lat = num("ddLat"), lon = num("ddLon");
    if (isNaN(lat) || isNaN(lon)) return show("ddOut", "Enter both a latitude and a longitude.", true);
    if (Math.abs(lat) > 90) return show("ddOut", "Latitude must be between -90 and 90.", true);
    if (Math.abs(lon) > 180) return show("ddOut", "Longitude must be between -180 and 180.", true);
    show("ddOut", `${toDMS(lat, true)}<small>${toDMS(lon, false)}</small>`);
  }
  function updateDMS() {
    const d = num("dmsD"), m = num("dmsM"), s = num("dmsS"), dir = $("dmsDir").value;
    if ([d, m, s].some(isNaN)) return show("dmsOut", "Fill in degrees, minutes and seconds.", true);
    if (m >= 60 || s >= 60 || d < 0 || m < 0 || s < 0) return show("dmsOut", "Minutes and seconds must be from 0 to under 60.", true);
    const isLat = dir === "N" || dir === "S";
    let dd = d + m / 60 + s / 3600;
    if (dd > (isLat ? 90 : 180)) return show("dmsOut", `${isLat ? "Latitude" : "Longitude"} cannot go past ${isLat ? 90 : 180}°.`, true);
    if (dir === "S" || dir === "W") dd = -dd;
    show("dmsOut", `${dd.toFixed(6)}°<small>${isLat ? "Latitude" : "Longitude"} in decimal degrees</small>`);
  }
  ["ddLat", "ddLon"].forEach(id => $(id).addEventListener("input", updateDD));
  ["dmsD", "dmsM", "dmsS", "dmsDir"].forEach(id => $(id).addEventListener("input", updateDMS));
  updateDD(); updateDMS();

  /* =========================================================
     Tool 2: distance (great-circle) calculator
     ========================================================= */
  const CITIES = [
    ["Rawalpindi", 33.5651, 73.0169],
    ["Islamabad", 33.6844, 73.0479],
    ["Lahore", 31.5204, 74.3587],
    ["Karachi", 24.8607, 67.0011],
    ["Quetta", 30.1798, 66.9750],
    ["Peshawar", 34.0151, 71.5249],
    ["Gilgit", 35.9208, 74.3080]
  ];
  const rad = (x) => x * Math.PI / 180;
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.0088; // mean Earth radius in km
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function compass(deg) {
    const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return names[Math.round(deg / 22.5) % 16];
  }

  function setupPoint(suffix, startIndex) {
    const sel = $("city" + suffix);
    sel.innerHTML = CITIES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join("") + '<option value="custom">Custom</option>';
    sel.value = String(startIndex);
    const fill = () => {
      if (sel.value === "custom") return;
      const c = CITIES[Number(sel.value)];
      $("lat" + suffix).value = c[1];
      $("lon" + suffix).value = c[2];
    };
    fill();
    sel.addEventListener("change", () => { fill(); updateDist(); });
    ["lat", "lon"].forEach(k => $(k + suffix).addEventListener("input", () => { sel.value = "custom"; updateDist(); }));
  }

  // Simple equirectangular sketch over Pakistan's approximate extent.
  const MAP = { w: 360, h: 300, lon0: 60, lon1: 78, lat0: 23, lat1: 37.5 };
  const px = (lon) => ((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * MAP.w;
  const py = (lat) => ((MAP.lat1 - lat) / (MAP.lat1 - MAP.lat0)) * MAP.h;
  function drawMap(a, b) {
    let g = "";
    for (let lon = 62; lon <= 76; lon += 2) g += `<line x1="${px(lon)}" y1="0" x2="${px(lon)}" y2="${MAP.h}" stroke="#b5d3cb" stroke-width="1"/>`;
    for (let lat = 24; lat <= 36; lat += 2) g += `<line x1="0" y1="${py(lat)}" x2="${MAP.w}" y2="${py(lat)}" stroke="#b5d3cb" stroke-width="1"/>`;
    CITIES.forEach(c => { g += `<circle cx="${px(c[2])}" cy="${py(c[1])}" r="3" fill="#7aa9a0"/>`; });
    const inside = (p) => p.lon >= MAP.lon0 && p.lon <= MAP.lon1 && p.lat >= MAP.lat0 && p.lat <= MAP.lat1;
    if (inside(a) && inside(b)) {
      g += `<line x1="${px(a.lon)}" y1="${py(a.lat)}" x2="${px(b.lon)}" y2="${py(b.lat)}" stroke="#0a2b3d" stroke-width="2.4" stroke-dasharray="7 5"/>`;
      g += `<circle cx="${px(a.lon)}" cy="${py(a.lat)}" r="7.5" fill="#f5b82e" stroke="#0a2b3d" stroke-width="2.5"/><text x="${px(a.lon)}" y="${py(a.lat) - 12}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="13" fill="#0a2b3d">A</text>`;
      g += `<circle cx="${px(b.lon)}" cy="${py(b.lat)}" r="7.5" fill="#0e7c7b" stroke="#0a2b3d" stroke-width="2.5"/><text x="${px(b.lon)}" y="${py(b.lat) - 12}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="13" fill="#0a2b3d">B</text>`;
    } else {
      g += `<text x="${MAP.w / 2}" y="${MAP.h / 2}" text-anchor="middle" font-family="Arial" font-size="14" fill="#35505f">Points are outside this sketch</text>`;
    }
    $("distMap").innerHTML = g;
  }

  function updateDist() {
    const a = { lat: num("latA"), lon: num("lonA") }, b = { lat: num("latB"), lon: num("lonB") };
    const vals = [a.lat, a.lon, b.lat, b.lon];
    if (vals.some(isNaN)) { show("distOut", "Enter latitude and longitude for both points.", true); return; }
    if (Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90 || Math.abs(a.lon) > 180 || Math.abs(b.lon) > 180) {
      show("distOut", "Latitude must be within ±90 and longitude within ±180.", true); return;
    }
    const km = haversine(a.lat, a.lon, b.lat, b.lon);
    const brg = bearing(a.lat, a.lon, b.lat, b.lon);
    show("distOut", `${km.toFixed(1)} km (${(km * 0.621371).toFixed(1)} miles)<small>Heading from A to B: ${brg.toFixed(0)}° ${compass(brg)}</small>`);
    drawMap(a, b);
  }
  setupPoint("A", 0);
  setupPoint("B", 2);
  updateDist();

  /* =========================================================
     Tool 3: map scale calculator
     ========================================================= */
  const fmt = (n) => Number(n.toFixed(3)).toLocaleString("en-US");
  function updateScale() {
    const den = num("scaleDen"), cm = num("mapCm"), km = num("groundKm");
    if (isNaN(den) || den < 1) {
      show("scaleOut1", "Enter a scale denominator of 1 or more.", true);
      show("scaleOut2", "Enter a scale denominator of 1 or more.", true);
      return;
    }
    if (isNaN(cm) || cm < 0) show("scaleOut1", "Enter the distance measured on the map.", true);
    else {
      const meters = cm * den / 100;
      show("scaleOut1", `${fmt(meters / 1000)} km on the ground<small>${fmt(meters)} m</small>`);
    }
    if (isNaN(km) || km < 0) show("scaleOut2", "Enter the real distance in kilometres.", true);
    else show("scaleOut2", `${fmt(km * 100000 / den)} cm on the map<small>at a scale of 1 : ${den.toLocaleString("en-US")}</small>`);
  }
  $("scalePick").addEventListener("change", (e) => { if (e.target.value) { $("scaleDen").value = e.target.value; updateScale(); } });
  $("scaleDen").addEventListener("input", () => {
    const match = Array.from($("scalePick").options).some(o => o.value === $("scaleDen").value);
    $("scalePick").value = match ? $("scaleDen").value : "";
    updateScale();
  });
  ["mapCm", "groundKm"].forEach(id => $(id).addEventListener("input", updateScale));
  updateScale();
});
