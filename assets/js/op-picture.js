/* Operational picture — the hero canvas.
 *
 * A simulated maritime/air picture of the Indian Ocean around India: vessels
 * on shipping lanes, aircraft between airports, a coastal radar sweep and a
 * low-earth-orbit satellite pass. Everything is procedurally generated from a
 * seed; none of it is real data.
 *
 * Interaction: drag (or tap two points) to measure great-circle range and
 * initial bearing; hover a contact for its card; with the canvas focused, the
 * arrow keys step through contacts and Esc clears.
 *
 * The loop pauses when the tab is hidden, when the browser skips rendering
 * the hero (content-visibility), when it scrolls away, or when the visitor
 * presses "Pause motion". Under reduced motion it draws one still frame.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("op-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var hero = canvas.closest(".hero") || canvas.parentElement;
  var reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  var $ = function (id) { return document.getElementById(id); };
  var hudShips = $("hud-ships"), hudAir = $("hud-air"), hudPos = $("hud-pos");
  var readout = $("readout"), card = $("contact-card");

  // ------------------------------------------------------------- seeded RNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var seed = parseInt(new URLSearchParams(location.search).get("seed") || "1243", 10) || 1243;
  var rnd = mulberry32(seed);
  var R = function (a, b) { return a + rnd() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };

  // ------------------------------------------------------------- palette
  var C = {
    oceanIn: "#0c2131", oceanOut: "#050d15", land: "#0d2027", landDot: "rgba(150,210,220,0.10)",
    coast: "rgba(120,220,200,0.55)", shelf: "rgba(95,224,189,0.05)", grid: "rgba(140,200,220,0.08)",
    gridLabel: "rgba(160,200,215,0.45)", label: "rgba(190,215,225,0.55)", sea: "rgba(160,200,215,0.22)",
    ship: "#5fe0bd", air: "#f4b860", sat: "#86b8f0", measure: "#5fe0bd", ring: "rgba(95,224,189,0.16)",
  };

  // ------------------------------------------------------------- geography (lon, lat) — simplified
  var LAND = [
    // Arabian peninsula (to the Gulf)
    [[44,30],[44,12.8],[45.5,13.3],[48,14],[49.5,14.7],[51.5,15.3],[52.2,15.7],[53.5,16.6],[55,17.2],[56.5,18],[57.7,18.9],[58.4,20.4],[59.4,21.3],[59.8,22.4],[58.8,23.5],[57.6,23.8],[56.4,24.6],[56.3,25.8],[56.4,26.3],[55.6,25.5],[54.6,24.3],[53.5,24.1],[52,23.9],[51.4,24.6],[51.6,26],[50.8,26.5],[50,27.3],[48.6,28.8],[47.8,30]],
    // Horn of Africa
    [[38,16],[43.3,12.5],[44.5,10.4],[46.5,10.8],[48.5,11.2],[50.2,11.9],[51.3,11.8],[51.1,10.5],[50.8,9.2],[49.9,7.5],[48.9,5.6],[47.9,4.3],[46.4,2.6],[44.8,1.4],[43,0],[42,-2],[38,-4]],
    // Iran · Pakistan · India · Bangladesh · Myanmar
    [[50,31],[50.5,29.5],[51.5,27.9],[53.5,26.8],[55.5,26.7],[56.3,27.1],[57.3,25.8],[58.9,25.5],[61.6,25.2],[63.5,25.3],[64.7,25.2],[66.6,25.4],[67.2,24.8],[67.5,23.9],[68.4,23.5],[68.9,22.9],[69.7,22.8],[70.3,22.9],[70,22.5],[69.2,22.4],[68.97,22.24],[69.6,21.6],[70.6,20.9],[71.4,20.7],[72.1,21.2],[72.6,21.9],[72.6,22.3],[72.9,21.6],[72.8,20.9],[72.9,20],[72.8,19],[73,18],[73.3,17],[73.5,16],[73.8,15.4],[74.2,14.6],[74.5,13.8],[74.8,12.9],[75.2,12],[75.7,11.3],[76,10.6],[76.2,9.9],[76.5,9],[77,8.3],[77.55,8.08],[78.1,8.6],[78.2,9.1],[78.9,9.3],[79.3,9.3],[79.4,10.3],[79.85,10.3],[79.8,11],[79.85,12],[80.2,12.9],[80.3,13.6],[80.15,14.6],[80.1,15.4],[80.9,15.8],[81.3,16.3],[82.3,16.6],[82.4,17],[83.3,17.7],[84.1,18.3],[84.9,19.2],[85.5,19.7],[86.4,20],[86.9,20.7],[87,21.5],[87.8,21.7],[88.3,21.6],[89.1,21.8],[90.3,21.9],[91,22.6],[91.8,22.3],[92,21.1],[92.4,20.6],[93.1,19.9],[93.6,19.4],[94.3,18.6],[94.5,17.3],[94.2,16],[94.7,15.9],[95.4,15.7],[96.3,16.5],[97.2,16.8],[97.6,15.6],[97.8,14.5],[98.2,13.4],[98.6,11.8],[98.6,10.5],[98.3,9],[98.4,8],[100,6.5],[103,6],[106,31]],
    // Sri Lanka
    [[79.85,9.8],[80.25,9.8],[81.2,8.6],[81.9,7.4],[81.65,6.4],[80.6,5.92],[80,6.4],[79.8,7.6],[79.75,8.6]],
    // Sumatra (northern tip)
    [[95.2,5.6],[95.9,5.5],[97.5,5.2],[98.6,4.1],[100,2.4],[101.5,1],[104,-1],[104,-4],[101,-4],[98,0],[96.2,3],[95.3,4.8]],
  ];
  var ISLANDS = [
    [92.72,11.7,0.1,0.45],[92.85,12.6,0.09,0.4],[92.98,13.3,0.08,0.25],[93.8,7.1,0.1,0.2],[92.95,8.1,0.06,0.12], // Andaman & Nicobar
    [53.9,12.5,0.75,0.22], // Socotra
  ];
  var ATOLLS = [[72.6,10.6],[73,11.2],[72.2,11.1],[73.6,10.1],[73.4,6.8],[73,5.6],[73.5,4.2],[73.3,3.2],[73,1.9],[73.2,0.6]];
  var PLACES = [
    ["Mumbai",72.85,19.0,1],["Kochi",76.25,9.95,1],["Chennai",80.28,13.08,1],["Visakhapatnam",83.3,17.7,1],
    ["Kolkata",88.35,22.55,1],["Colombo",79.85,6.93,-1],["Karachi",67.0,24.86,1],["Muscat",58.4,23.6,-1],["Malé",73.5,4.18,1],
  ];
  var SEAS = [["ARABIAN SEA",64.5,14.5],["BAY OF BENGAL",88.5,14.5],["INDIAN OCEAN",80,1.5],["LACCADIVE SEA",74.5,7.5]];

  // Shipping lanes for vessels.
  var LANES = [
    [[50,12.5],[56,12.6],[62,11],[68,8.6],[76,6.1],[80.5,5.55],[86,5.9],[92,6.1],[97,5.9],[101,3.6]],
    [[56.8,25.4],[60,23.2],[66,20.5],[71.5,18.7],[73,15],[75.4,9.5],[79.5,6.2]],
    [[56.8,25.4],[60,21],[62,14],[60.5,6],[57,-3]],
    [[88.2,21],[87.6,17],[85.6,12],[82.6,7.6],[80.8,5.6]],
    [[80.6,13.3],[81.6,15.8],[83.6,17.4],[86.6,19.9],[88.2,21.2]],
    [[80.5,13.1],[86,10.5],[92.5,7.6],[97.5,6]],
    [[76.1,9.9],[70,11.5],[62,12.6],[52,12.8]],
    [[66.9,24.6],[68.8,21.8],[71,19.6],[72.7,18.8]],
    [[73.7,15.3],[68,14],[60,13],[52,12.3]],
  ];
  var AIRPORTS = {
    BOM:[72.87,19.09], DEL:[77.1,28.56], MAA:[80.17,12.99], HYD:[78.43,17.24], CCU:[88.45,22.65],
    COK:[76.39,10.15], BLR:[77.7,13.2], DXB:[55.36,25.25], MCT:[58.28,23.59], SIN:[103.99,1.36],
    CMB:[79.88,7.18], MLE:[73.53,4.19], KUL:[101.7,2.74], VTZ:[83.22,17.72], GOI:[73.83,15.38],
  };
  var ROUTES = [["DXB","BOM"],["DEL","MAA"],["BOM","CCU"],["MCT","COK"],["MAA","SIN"],["CCU","SIN"],["BLR","MLE"],
    ["DXB","SIN"],["HYD","DXB"],["DEL","COK"],["CMB","KUL"],["BOM","SIN"],["DEL","BLR"],["VTZ","SIN"],["GOI","DXB"],["MLE","DXB"]];
  var NAMES = ["ALTAIR","KESTREL","SAGARIKA","MERIDIAN","NILGIRI","PERIPLUS","CORMORANT","HALCYON","VEGA","MONSOON",
    "SEAHAWK","TARANG","ORION","PETREL","LODESTAR","SAMUDRA","CASSIOPEIA","FULMAR","AVOCET","NAVIGATOR",
    "ANTARES","CYGNUS","BOREAS","TERN","POLARIS","RIGEL","JALADHI","MISTRAL","SHEARWATER","CAPELLA"];

  // ------------------------------------------------------------- geodesy
  var D2R = Math.PI / 180;
  function haversineKm(a, b) {
    var dLat = (b[1] - a[1]) * D2R, dLon = (b[0] - a[0]) * D2R;
    var s = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function bearing(a, b) {
    var y = Math.sin((b[0] - a[0]) * D2R) * Math.cos(b[1] * D2R);
    var x = Math.cos(a[1] * D2R) * Math.sin(b[1] * D2R) - Math.sin(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((b[0] - a[0]) * D2R);
    return (Math.atan2(y, x) / D2R + 360) % 360;
  }
  function fmtLat(v) { var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return pad(d, 2) + "°" + m.toFixed(1).padStart(4, "0") + "′" + (v >= 0 ? "N" : "S"); }
  function fmtLon(v) { var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return pad(d, 3) + "°" + m.toFixed(1).padStart(4, "0") + "′" + (v >= 0 ? "E" : "W"); }
  function pad(n, w) { return String(n).padStart(w, "0"); }

  // ------------------------------------------------------------- view / projection
  var KX = Math.cos(13 * D2R);
  var W = 0, H = 0, dpr = 1, S = 1, lonC = 74, latC = 13.5, staticLayer = null;
  function project(lon, lat) { return [W / 2 + (lon - lonC) * KX * S, H / 2 - (lat - latC) * S]; }
  function unproject(x, y) { return [lonC + (x - W / 2) / (KX * S), latC - (y - H / 2) / S]; }

  function layout() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var wide = W >= 900;
    // Wide screens: India sits right of centre, the copy sits over the Arabian Sea.
    lonC = wide ? 74.5 : 79.5;
    latC = wide ? 13.2 : 12.2;
    S = Math.max(W / (38 * KX), H / 26);
    if (!wide) S = Math.max(W / (16 * KX), H / 29);
    buildStatic();
    return true;
  }

  function polyPath(g, pts) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = project(pts[i][0], pts[i][1]);
      if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
    g.closePath();
  }

  function buildStatic() {
    staticLayer = document.createElement("canvas");
    staticLayer.width = canvas.width;
    staticLayer.height = canvas.height;
    var g = staticLayer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var oc = project(80, 10);
    var grd = g.createRadialGradient(oc[0], oc[1], 0, oc[0], oc[1], Math.max(W, H) * 0.9);
    grd.addColorStop(0, C.oceanIn);
    grd.addColorStop(1, C.oceanOut);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // Graticule every 5°.
    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    g.font = "500 10px 'JetBrains Mono', ui-monospace, monospace";
    g.fillStyle = C.gridLabel;
    var tl = unproject(0, 0), br = unproject(W, H);
    for (var lon = Math.ceil(tl[0] / 5) * 5; lon <= br[0]; lon += 5) {
      var x = Math.round(project(lon, 0)[0]) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      g.fillText(pad(lon, 3) + "°E", x + 4, H - 10);
    }
    for (var lat = Math.ceil(br[1] / 5) * 5; lat <= tl[1]; lat += 5) {
      var y = Math.round(project(0, lat)[1]) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      g.fillText(pad(Math.abs(lat), 2) + "°" + (lat >= 0 ? "N" : "S"), 8, y - 4);
    }

    // Dot texture for land.
    var pat = document.createElement("canvas");
    pat.width = pat.height = 6;
    var pg = pat.getContext("2d");
    pg.fillStyle = C.landDot;
    pg.fillRect(2, 2, 1.2, 1.2);
    var pattern = g.createPattern(pat, "repeat");

    // Continental-shelf glow, then land, then the coastline.
    LAND.forEach(function (poly) {
      polyPath(g, poly);
      g.strokeStyle = C.shelf; g.lineWidth = 22; g.lineJoin = "round"; g.stroke();
      g.lineWidth = 10; g.stroke();
    });
    LAND.forEach(function (poly) {
      polyPath(g, poly);
      g.fillStyle = C.land; g.fill();
      g.fillStyle = pattern; g.fill();
      g.strokeStyle = C.coast; g.lineWidth = 1; g.stroke();
    });
    ISLANDS.forEach(function (it) {
      var p = project(it[0], it[1]);
      g.beginPath();
      g.ellipse(p[0], p[1], Math.max(1.5, it[2] * KX * S), Math.max(1.5, it[3] * S), 0, 0, Math.PI * 2);
      g.fillStyle = C.land; g.fill();
      g.strokeStyle = C.coast; g.lineWidth = 1; g.stroke();
    });
    g.fillStyle = C.coast;
    ATOLLS.forEach(function (a) { var p = project(a[0], a[1]); g.beginPath(); g.arc(p[0], p[1], 1.4, 0, Math.PI * 2); g.fill(); });

    // Sea names and ports.
    g.font = "600 11px 'JetBrains Mono', ui-monospace, monospace";
    g.fillStyle = C.sea;
    g.textAlign = "center";
    SEAS.forEach(function (s) { var p = project(s[1], s[2]); spaced(g, s[0], p[0], p[1], 4); });
    g.textAlign = "left";
    g.font = "500 10px 'JetBrains Mono', ui-monospace, monospace";
    PLACES.forEach(function (pl) {
      var p = project(pl[1], pl[2]);
      g.fillStyle = C.coast;
      g.beginPath(); g.arc(p[0], p[1], 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = C.label;
      if (pl[3] > 0) g.fillText(pl[0], p[0] - g.measureText(pl[0]).width - 6, p[1] + 3);
      else g.fillText(pl[0], p[0] + 6, p[1] + 3);
    });
  }

  function spaced(g, text, x, y, sp) {
    var w = 0, i;
    for (i = 0; i < text.length; i++) w += g.measureText(text[i]).width + sp;
    var cx = x - w / 2;
    g.textAlign = "left";
    for (i = 0; i < text.length; i++) { g.fillText(text[i], cx, y); cx += g.measureText(text[i]).width + sp; }
    g.textAlign = "center";
  }

  // ------------------------------------------------------------- simulation
  var TF = 360; // simulated seconds per real second
  var degPerSec = function (kn) { return kn / 3600 / 60; };

  function laneGeom(pts) {
    var segs = [], total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], m = Math.cos(((a[1] + b[1]) / 2) * D2R);
      var len = Math.hypot((b[0] - a[0]) * m, b[1] - a[1]);
      segs.push({ a: a, b: b, len: len, start: total });
      total += len;
    }
    return { pts: pts, segs: segs, total: total };
  }
  var lanes = LANES.map(laneGeom);

  function lanePoint(L, d, off) {
    d = Math.max(0, Math.min(L.total, d));
    var s = L.segs[L.segs.length - 1];
    for (var i = 0; i < L.segs.length; i++) if (d <= L.segs[i].start + L.segs[i].len) { s = L.segs[i]; break; }
    var t = s.len ? (d - s.start) / s.len : 0;
    var lon = s.a[0] + (s.b[0] - s.a[0]) * t, lat = s.a[1] + (s.b[1] - s.a[1]) * t;
    var m = Math.cos(lat * D2R), dx = (s.b[0] - s.a[0]) * m, dy = s.b[1] - s.a[1], n = Math.hypot(dx, dy) || 1;
    // Offset perpendicular to the lane (in degrees of latitude).
    return [lon + (-dy / n) * off / m, lat + (dx / n) * off, Math.atan2(dx, dy)];
  }

  var contacts = [];
  var nShips = 30, nAir = 14;
  for (var i = 0; i < nShips; i++) {
    var L = pick(lanes);
    contacts.push({
      kind: "ship", lane: L, d: R(0, L.total), dir: rnd() < 0.5 ? 1 : -1, off: R(-0.45, 0.45),
      kn: Math.round(R(10, 21)), name: "MV " + NAMES[i % NAMES.length], id: "4" + Math.floor(R(19000000, 19999999)),
      hist: [], lon: 0, lat: 0, hdg: 0,
    });
  }
  var codes = Object.keys(AIRPORTS);
  function newRoute(c, from) {
    var r = from ? [from, pick(codes.filter(function (k) { return k !== from; }))] : pick(ROUTES);
    if (!from && rnd() < 0.5) r = [r[1], r[0]];
    c.from = r[0]; c.to = r[1];
    var a = AIRPORTS[c.from], b = AIRPORTS[c.to], m = Math.cos(((a[1] + b[1]) / 2) * D2R);
    c.len = Math.hypot((b[0] - a[0]) * m, b[1] - a[1]);
    c.d = 0;
  }
  for (var j = 0; j < nAir; j++) {
    var ac = { kind: "air", kn: Math.round(R(420, 490)), fl: Math.round(R(300, 400) / 10) * 10, name: "SIM" + Math.floor(R(100, 999)), hist: [], lon: 0, lat: 0, hdg: 0 };
    newRoute(ac);
    ac.d = R(0, ac.len);
    contacts.push(ac);
  }
  var sat = { kind: "sat", name: "LEO-1 (SIM)", inc: 51.6, u: -0.35, node: R(52, 70), hist: [], lon: 0, lat: 0, hdg: 0, alt: 420 };
  contacts.push(sat);

  function satPos(node, u) {
    var i = sat.inc * D2R;
    var lat = Math.asin(Math.sin(i) * Math.sin(u)) / D2R;
    var lon = node + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) / D2R - 23.2 * (u / (2 * Math.PI));
    return [lon, lat];
  }

  var histClock = 0;
  function step(dt) {
    var sdt = dt * TF;
    for (var k = 0; k < contacts.length; k++) {
      var c = contacts[k];
      if (c.kind === "ship") {
        c.d += c.dir * degPerSec(c.kn) * sdt;
        if (c.d > c.lane.total) { c.d = 0; c.hist.length = 0; }
        if (c.d < 0) { c.d = c.lane.total; c.hist.length = 0; }
        var p = lanePoint(c.lane, c.d, c.off);
        c.lon = p[0]; c.lat = p[1]; c.hdg = ((p[2] / D2R) + (c.dir < 0 ? 180 : 0) + 360) % 360;
      } else if (c.kind === "air") {
        c.d += degPerSec(c.kn) * sdt;
        if (c.d >= c.len) { newRoute(c, c.to); c.hist.length = 0; }
        var a = AIRPORTS[c.from], b = AIRPORTS[c.to], t = c.len ? c.d / c.len : 0;
        c.lon = a[0] + (b[0] - a[0]) * t; c.lat = a[1] + (b[1] - a[1]) * t;
        c.hdg = bearing(a, b);
      } else {
        // The satellite runs on its own, slower clock: one visible pass ≈ 50 s.
        c.u += dt * 0.024;
        if (c.u > 1.05) { c.u = -0.35; c.node = R(50, 72); c.hist.length = 0; }
        var sp = satPos(c.node, c.u), sp2 = satPos(c.node, c.u + 0.01);
        c.lon = sp[0]; c.lat = sp[1]; c.hdg = bearing(sp, sp2);
      }
    }
    histClock += dt;
    if (histClock >= 1.2) {
      histClock = 0;
      for (var q = 0; q < contacts.length; q++) {
        var h = contacts[q].hist;
        h.push([contacts[q].lon, contacts[q].lat]);
        if (h.length > (contacts[q].kind === "air" ? 10 : 18)) h.shift();
      }
    }
  }
  // Warm up so tracks already carry history on the first frame.
  for (var w = 0; w < 26; w++) step(1.2);

  // ------------------------------------------------------------- radar
  var RADAR = { lon: 76.3, lat: 9.9, range: 8.5, period: 6 };
  var sweep = 0;

  // ------------------------------------------------------------- interaction state
  var hover = null, selected = null, selIndex = -1;
  var measure = null; // { a: [lon,lat], b: [lon,lat], live: bool }
  var anchor = null, downAt = null, dragging = false;
  var screen = []; // cached screen positions for hit-testing

  function setReadout(html, announce) {
    if (!readout) return;
    readout.innerHTML = html;
    readout.setAttribute("aria-live", announce ? "polite" : "off");
  }
  function hint() {
    var touch = matchMedia("(pointer: coarse)").matches;
    setReadout('<span class="hint">' + (touch ? "Tap two points to measure range · bearing" : "Drag to measure range · bearing") + "</span>", false);
  }
  function measureText(a, b) {
    var km = haversineKm(a, b), nm = km / 1.852, brg = bearing(a, b);
    return { km: km, nm: nm, brg: brg,
      html: "RNG <b>" + nm.toFixed(1) + " nm</b> · " + km.toFixed(0) + " km &nbsp; BRG <b>" + brg.toFixed(1).padStart(5, "0") + "°T</b>" };
  }

  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function nearest(x, y, max) {
    var best = null, bd = max;
    for (var i = 0; i < screen.length; i++) {
      var s = screen[i], d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s.c; }
    }
    return best;
  }

  canvas.addEventListener("pointermove", function (e) {
    var p = pointer(e), ll = unproject(p[0], p[1]);
    if (hudPos) hudPos.textContent = fmtLat(ll[1]).slice(0, 7) + " " + fmtLon(ll[0]).slice(0, 8);
    if (downAt && (e.buttons & 1) && e.pointerType === "mouse") {
      if (!dragging && Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) > 6) {
        dragging = true;
        measure = { a: unproject(downAt[0], downAt[1]), b: ll, live: true };
      }
      if (dragging) { measure.b = ll; setReadout(measureText(measure.a, measure.b).html, false); }
    }
    hover = e.pointerType === "mouse" ? nearest(p[0], p[1], 14) : null;
    if (!running) draw(); // keep hover feedback when paused
  });
  canvas.addEventListener("pointerleave", function () { hover = null; if (hudPos) hudPos.textContent = "—"; if (!running) draw(); });
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    downAt = pointer(e);
    dragging = false;
  });
  canvas.addEventListener("pointerup", function (e) {
    var p = pointer(e);
    if (dragging && measure) {
      measure.live = false;
      setReadout(measureText(measure.a, measure.b).html, true);
    } else if (downAt) {
      // A tap: pick a contact if one is under it, else two taps make a measurement.
      var hit = nearest(p[0], p[1], e.pointerType === "mouse" ? 14 : 22);
      if (hit) { selected = hit; selIndex = contacts.indexOf(hit); }
      else if (!anchor) { anchor = unproject(p[0], p[1]); measure = null; setReadout('<span class="hint">Now pick a second point</span>', false); }
      else { measure = { a: anchor, b: unproject(p[0], p[1]), live: false }; anchor = null; setReadout(measureText(measure.a, measure.b).html, true); }
    }
    downAt = null; dragging = false;
    if (!running) draw();
  });
  canvas.addEventListener("pointercancel", function () { downAt = null; dragging = false; });

  canvas.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      var visible = contacts.filter(function (c) { var p = project(c.lon, c.lat); return p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H; });
      if (!visible.length) return;
      var cur = visible.indexOf(selected);
      var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      selected = visible[(cur + dir + visible.length) % visible.length];
      selIndex = contacts.indexOf(selected);
      announce(selected);
      if (!running) draw();
    } else if (e.key === "Escape") {
      selected = null; measure = null; anchor = null; hint();
      if (card) card.hidden = true;
      if (!running) draw();
    }
  });
  canvas.addEventListener("blur", function () { if (selected && card) { selected = null; card.hidden = true; } });

  function announce(c) {
    if (!readout) return;
    var text = c.kind === "ship" ? c.name + ", vessel, " + c.kn + " knots, course " + Math.round(c.hdg) + " degrees"
      : c.kind === "air" ? c.name + ", aircraft, " + c.from + " to " + c.to
      : c.name + ", satellite pass";
    setReadout('<span class="hint">' + text + "</span>", true);
  }

  // ------------------------------------------------------------- drawing
  function draw() {
    if (!staticLayer) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Radar: rings, then the sweep wedge.
    var rc = project(RADAR.lon, RADAR.lat), rr = RADAR.range * S;
    ctx.strokeStyle = C.ring;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    for (var k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(rc[0], rc[1], (rr * k) / 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    var ang = sweep - Math.PI / 2;
    var slices = 18, span = 0.9;
    for (var s = 0; s < slices; s++) {
      var a0 = ang - (span * (s + 1)) / slices, a1 = ang - (span * s) / slices;
      ctx.beginPath(); ctx.moveTo(rc[0], rc[1]); ctx.arc(rc[0], rc[1], rr, a0, a1); ctx.closePath();
      ctx.fillStyle = "rgba(95,224,189," + (0.10 * (1 - s / slices)).toFixed(3) + ")";
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(95,224,189,0.55)";
    ctx.beginPath(); ctx.moveTo(rc[0], rc[1]); ctx.lineTo(rc[0] + Math.cos(ang) * rr, rc[1] + Math.sin(ang) * rr); ctx.stroke();
    ctx.fillStyle = C.ship; ctx.beginPath(); ctx.arc(rc[0], rc[1], 2.5, 0, Math.PI * 2); ctx.fill();

    // Satellite: ground track, footprint, body.
    ctx.strokeStyle = "rgba(134,184,240,0.45)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (var u = -0.5, first = true; u <= 1.2; u += 0.02) {
      var gp = satPos(sat.node, u), pp = project(gp[0], gp[1]);
      if (first) { ctx.moveTo(pp[0], pp[1]); first = false; } else ctx.lineTo(pp[0], pp[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    var sp = project(sat.lon, sat.lat), fr = 15.3;
    ctx.strokeStyle = "rgba(134,184,240,0.25)";
    ctx.beginPath();
    ctx.ellipse(sp[0], sp[1], (fr / Math.max(0.3, Math.cos(sat.lat * D2R))) * KX * S, fr * S, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Tracks.
    screen.length = 0;
    for (var i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      var p = project(c.lon, c.lat);
      var col = c.kind === "ship" ? C.ship : c.kind === "air" ? C.air : C.sat;
      if (c.hist.length > 1) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = c.kind === "ship" ? 0.28 : 0.22;
        ctx.setLineDash(c.kind === "air" ? [3, 4] : []);
        ctx.beginPath();
        for (var h = 0; h < c.hist.length; h++) { var hp = project(c.hist[h][0], c.hist[h][1]); if (h) ctx.lineTo(hp[0], hp[1]); else ctx.moveTo(hp[0], hp[1]); }
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
      screen.push({ x: p[0], y: p[1], c: c });

      // Brighten what the sweep just passed.
      var glow = 0;
      var dx = p[0] - rc[0], dy = p[1] - rc[1];
      if (c.kind === "ship" && Math.hypot(dx, dy) < rr) {
        var ca = Math.atan2(dy, dx), delta = ((ang - ca) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        glow = Math.max(0, 1 - delta / 2.2);
      }
      ctx.save();
      ctx.translate(p[0], p[1]);
      if (glow > 0) { ctx.fillStyle = "rgba(95,224,189," + (0.35 * glow).toFixed(3) + ")"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.rotate(c.hdg * D2R);
      ctx.fillStyle = col;
      if (c.kind === "ship") {
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(95,224,189,0.5)"; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -6 - c.kn * 0.7); ctx.stroke();
      } else if (c.kind === "air") {
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1.6, -1); ctx.lineTo(7, 2); ctx.lineTo(1.6, 1.5); ctx.lineTo(1.2, 5); ctx.lineTo(3, 6.5);
        ctx.lineTo(-3, 6.5); ctx.lineTo(-1.2, 5); ctx.lineTo(-1.6, 1.5); ctx.lineTo(-7, 2); ctx.lineTo(-1.6, -1); ctx.closePath(); ctx.fill();
      } else {
        ctx.rotate(-c.hdg * D2R);
        ctx.fillRect(-2.5, -2.5, 5, 5);
        ctx.fillRect(-9, -1, 5, 2); ctx.fillRect(4, -1, 5, 2);
      }
      ctx.restore();

      if (c === hover || c === selected) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.strokeRect(p[0] - 11.5, p[1] - 11.5, 23, 23);
        ctx.lineWidth = 1;
      }
    }
    if (sp[0] > 0 && sp[0] < W && sp[1] > 0 && sp[1] < H) {
      ctx.font = "600 10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillStyle = "rgba(134,184,240,0.85)";
      ctx.fillText("LEO · TLE PASS", sp[0] + 12, sp[1] - 8);
    }

    drawMeasure();
    updateCard();
  }

  function drawMeasure() {
    var pts = measure ? [measure.a, measure.b] : anchor ? [anchor] : null;
    if (!pts) return;
    var a = project(pts[0][0], pts[0][1]);
    ctx.strokeStyle = C.measure; ctx.fillStyle = C.measure; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(a[0], a[1], 4, 0, Math.PI * 2); ctx.stroke();
    if (pts.length < 2) return;
    var b = project(pts[1][0], pts[1][1]);
    var rad = Math.hypot(b[0] - a[0], b[1] - a[1]);
    ctx.strokeStyle = "rgba(95,224,189,0.22)";
    ctx.beginPath(); ctx.arc(a[0], a[1], rad, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.measure;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(b[0], b[1], 4, 0, Math.PI * 2); ctx.fill();
    var m = measureText(pts[0], pts[1]);
    var label = m.nm.toFixed(1) + " nm · " + m.brg.toFixed(0).padStart(3, "0") + "°";
    ctx.font = "600 11px 'JetBrains Mono', ui-monospace, monospace";
    var tw = ctx.measureText(label).width + 12, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    ctx.fillStyle = "rgba(6,16,24,0.88)"; ctx.fillRect(mx - tw / 2, my - 22, tw, 18);
    ctx.strokeStyle = "rgba(95,224,189,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2 + 0.5, my - 21.5, tw - 1, 17);
    ctx.fillStyle = C.measure; ctx.fillText(label, mx - tw / 2 + 6, my - 9);
  }

  function updateCard() {
    if (!card) return;
    var c = hover || selected;
    if (!c) { card.hidden = true; return; }
    var p = project(c.lon, c.lat);
    var rows;
    if (c.kind === "ship") rows = [["MMSI", c.id], ["SOG", c.kn + " kn"], ["COG", Math.round(c.hdg).toString().padStart(3, "0") + "°"]];
    else if (c.kind === "air") rows = [["Route", c.from + " → " + c.to], ["GS", c.kn + " kn"], ["Level", "FL" + c.fl]];
    else rows = [["Orbit", "LEO · i " + sat.inc + "°"], ["Alt", "~" + sat.alt + " km"], ["Source", "TLE (sim)"]];
    var tag = c.kind === "ship" ? '<span class="tag">Vessel</span>' : c.kind === "air" ? '<span class="tag air">Aircraft</span>' : '<span class="tag sat">Satellite</span>';
    var html = tag + "<strong>" + c.name + "</strong>";
    rows.forEach(function (r) { html += '<div><span class="k">' + r[0] + "</span> " + r[1] + "</div>"; });
    html += '<div><span class="k">Pos</span> ' + fmtLat(c.lat) + " " + fmtLon(c.lon) + "</div>";
    if (card.innerHTML !== html) card.innerHTML = html;
    card.hidden = false;
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var x = p[0] + 16, y = p[1] + 16;
    if (x + cw > W - 8) x = p[0] - cw - 16;
    if (y + ch > H - 8) y = p[1] - ch - 16;
    card.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    card.style.left = "0"; card.style.top = "0";
  }

  // ------------------------------------------------------------- loop & pausing
  var running = false, raf = 0, last = 0;
  var onScreen = true, rendered = true, userPaused = false;

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    step(dt);
    sweep = (sweep + (dt * 2 * Math.PI) / RADAR.period) % (2 * Math.PI);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function wantRun() { return onScreen && rendered && !userPaused && !reduceMQ.matches && document.visibilityState === "visible"; }
  function sync() {
    var want = wantRun();
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); draw(); }
  }

  document.addEventListener("visibilitychange", sync);
  reduceMQ.addEventListener("change", sync);
  // Rendering-heavy work: follow the browser's own skip/resume of the hero.
  hero.addEventListener("contentvisibilityautostatechange", function (e) { rendered = !e.skipped; sync(); });
  // Fallback for browsers without content-visibility: an observer.
  if (!("contentVisibility" in document.documentElement.style)) {
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; sync(); }, { rootMargin: "100px" }).observe(hero);
  } else {
    // content-visibility keeps rendering while near the viewport; also stop once fully scrolled away.
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; sync(); }).observe(hero);
  }

  // Public hook for the "Pause motion" control.
  window.OpPicture = {
    setPaused: function (p) { userPaused = p; sync(); },
    get paused() { return userPaused; },
  };

  var ro = new ResizeObserver(function () { if (layout()) draw(); });
  ro.observe(canvas);

  if (hudShips) hudShips.textContent = String(nShips);
  if (hudAir) hudAir.textContent = String(nAir);
  hint();
  if (layout()) draw();
  // Webfonts change label widths on the static layer: redraw once they land.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (layout()) draw(); });
  sync();
})();
