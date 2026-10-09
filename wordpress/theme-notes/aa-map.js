/* AeroAssist hero: live response map.
   A stylised Phoenix street grid in perspective. A 911 call drops, the nearest dock launches,
   the aircraft flies straight to the scene while the first ground unit drives the grid.
   Illustration only; no live data. Drives the dispatch panel (#opsLog etc.) when present. */
(function () {
  'use strict';
  var host = document.getElementById('aaSky');
  if (!host) return;
  var hero = host.parentNode;
  ['aaWorld', 'aaHud'].forEach(function (id) { var e = document.getElementById(id); if (e) e.parentNode.removeChild(e); });
  host.classList.add('aa-map-on');
  var cv = document.createElement('canvas'); cv.className = 'aa-map'; host.appendChild(cv);
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  var base = document.createElement('canvas'), bctx = base.getContext('2d');
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var GOLD = '226,190,114', GREY = '200,207,218', RED = '255,114,104', STEEL = '157,176,196';
  var MONO = "'IBM Plex Mono',ui-monospace,monospace";
  var NS = ['67th Ave', '51st Ave', '35th Ave', '19th Ave', 'Central Ave', '16th St', '32nd St', '48th St', '64th St'];
  var EW = ['McDowell', 'Thomas', 'Indian School', 'Camelback', 'Bethany Home', 'Glendale', 'Northern', 'Dunlap', 'Peoria', 'Cactus', 'Thunderbird', 'Greenway', 'Bell', 'Union Hills', 'Beardsley'];
  var CALLS = [['P1', 'Structure fire', 'red'], ['P1', 'Shots fired', 'red'], ['P2', 'Injury collision', 'gold'], ['P2', 'Missing person', 'gold'],
               ['P1', 'Armed subject', 'red'], ['P2', 'Brush fire', 'gold'], ['P3', 'Debris in roadway', 'blue'], ['P2', 'Burglary in progress', 'gold']];
  var DOCKS = [], STATIONS = [];

  var W = 0, H = 0, DPR = 1, cx = 0, hz = 0, f = 0, z0 = 420, camH = 0, narrow = false, avoid = null;
  function P(x, z, alt) { var s = f / (z + z0); return [cx + x * s, hz + camH * s - (alt || 0) * s]; }
  function depthA(z) { var t = 1 - z / 1700; return t <= 0 ? 0 : Math.pow(t, 1.1); }
  function inv(sx, sy) { var s = (sy - hz) / camH; return [(sx - cx) / s, f / s - z0]; }
  function snap(v, g) { return Math.round(v / g) * g; }
  function place(list, g) { return list.map(function (a) { var w = inv(a[0] * W, a[1] * H); return [snap(w[0], g), Math.max(20, snap(w[1], g))]; }); }

  function layout() {
    var r = host.getBoundingClientRect();
    W = Math.max(320, r.width); H = Math.max(320, r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    narrow = W < 860;
    cx = W * (narrow ? 0.55 : 0.66); hz = H * (narrow ? 0.14 : 0.22); f = H * 1.1;
    camH = (H * (narrow ? 0.62 : 1.02) - hz) * z0 / f;
    DOCKS = place(narrow ? [[0.2, 0.24], [0.5, 0.21], [0.8, 0.25], [0.35, 0.36], [0.68, 0.38], [0.92, 0.33]]
                         : [[0.55, 0.47], [0.71, 0.4], [0.88, 0.47], [0.6, 0.66], [0.79, 0.6], [0.96, 0.68], [0.5, 0.86], [0.28, 0.58], [0.14, 0.8]], 50);
    STATIONS = place(narrow ? [[0.1, 0.3], [0.9, 0.2], [0.55, 0.45]] : [[0.62, 0.32], [0.99, 0.38], [0.44, 0.97], [0.9, 0.95]], 100);
    [cv, base].forEach(function (c) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); });
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ops = document.getElementById('aaOps');
    if (ops && ops.offsetParent) { var o = ops.getBoundingClientRect(); avoid = [o.left - r.left - 250, o.top - r.top - 110, o.right - r.left + 40, o.bottom - r.top + 30]; } else avoid = null;
    drawBase();
  }

  function seg(c, x1, z1, x2, z2, rgb, a, w) {
    // split long lines so the depth fade follows them
    var n = Math.max(1, Math.ceil(Math.abs(z2 - z1) / 60));
    for (var i = 0; i < n; i++) {
      var za = z1 + (z2 - z1) * i / n, zb = z1 + (z2 - z1) * (i + 1) / n, xa = x1 + (x2 - x1) * i / n, xb = x1 + (x2 - x1) * (i + 1) / n;
      var al = a * depthA((za + zb) / 2); if (al < 0.004) continue;
      var p = P(xa, za), q = P(xb, zb);
      c.strokeStyle = 'rgba(' + rgb + ',' + al.toFixed(3) + ')'; c.lineWidth = w; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
    }
  }
  function label(c, x, y, text, rgb, a, align, size) {
    c.font = '500 ' + (size || 10.5) + 'px ' + MONO; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    try { c.letterSpacing = '0.12em'; } catch (e) {}
    c.fillStyle = 'rgba(' + rgb + ',' + a + ')'; c.fillText(text, x, y);
    try { c.letterSpacing = '0px'; } catch (e) {}
  }

  function drawBase() {
    var c = bctx; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
    // horizon haze
    var g = c.createLinearGradient(0, hz - 70, 0, hz + 160);
    g.addColorStop(0, 'rgba(' + GOLD + ',0)'); g.addColorStop(0.45, 'rgba(' + GOLD + ',0.05)'); g.addColorStop(1, 'rgba(' + GOLD + ',0)');
    c.fillStyle = g; c.fillRect(0, hz - 70, W, 230);
    c.lineCap = 'round';
    var X0 = -2400, X1 = 2400, Z1 = 1700;
    // local streets (near only)
    for (var x = X0; x <= X1; x += 25) if (x % 50) seg(c, x, 0, x, 600, GREY, 0.06, 0.6);
    for (var z = 0; z <= 600; z += 25) if (z % 50) seg(c, X0, z, X1, z, GREY, 0.06, 0.6);
    // half-mile collectors
    for (x = X0 + 50; x <= X1; x += 100) seg(c, x, 0, x, Z1, GREY, 0.11, 0.8);
    for (z = 50; z <= Z1; z += 100) seg(c, X0, z, X1, z, GREY, 0.11, 0.8);
    // mile roads
    for (x = X0; x <= X1; x += 100) seg(c, x, 0, x, Z1, GREY, 0.3, 1);
    for (z = 0; z <= Z1; z += 100) seg(c, X0, z, X1, z, GREY, 0.3, 1);
    // Grand Avenue: the one diagonal
    seg(c, -2400, 1650, 300, 0, GREY, 0.26, 1.1);
    // a freeway loop and a canal
    var fw = [], cn = [], i;
    for (i = 0; i <= 60; i++) { var t = i / 60; fw.push([-2400 + 4800 * t, 1300 - 760 * Math.sin(Math.PI * t)]); cn.push([-2400 + 4800 * t, 250 + 90 * Math.sin(t * 9) + 320 * t]); }
    for (i = 0; i < 60; i++) {
      seg(c, fw[i][0], fw[i][1], fw[i + 1][0], fw[i + 1][1], GREY, 0.3, 2.2);
      seg(c, cn[i][0], cn[i][1], cn[i + 1][0], cn[i + 1][1], STEEL, 0.22, 1.4);
    }
    // stations
    STATIONS.forEach(function (s) { var p = P(s[0], s[1]), a = depthA(s[1]); c.fillStyle = 'rgba(' + GREY + ',' + (0.55 * a) + ')'; c.fillRect(p[0] - 3, p[1] - 3, 6, 6); });
    // docks
    DOCKS.forEach(function (d, k) { drawDock(c, d, k, 0); });
  }
  function drawDock(c, d, k, hot) {
    var p = P(d[0], d[1]), a = depthA(d[1]); if (a < 0.05) return;
    var s = 4 + 3 * a;
    c.save(); c.translate(p[0], p[1]); c.rotate(Math.PI / 4);
    c.strokeStyle = 'rgba(' + GOLD + ',' + (0.35 + 0.55 * a + hot * 0.3) + ')'; c.lineWidth = 1.2; c.strokeRect(-s, -s, 2 * s, 2 * s);
    c.fillStyle = 'rgba(' + GOLD + ',' + (0.5 + 0.5 * hot) * a + ')'; c.fillRect(-1.6, -1.6, 3.2, 3.2);
    c.restore();
    if ((a > 0.4 && (narrow || p[0] > W * 0.5)) || hot) label(c, p[0] + 12, p[1] + 1, 'DOCK ' + (k < 9 ? '0' : '') + (k + 1), GOLD, (0.38 + 0.5 * hot) * Math.min(1, a + 0.3), 'left', 9.5);
  }

  function callout(c, sp, left, lines, a) {
    c.font = '500 10.5px ' + MONO; try { c.letterSpacing = '0.12em'; } catch (e) {}
    var w = 0; lines.forEach(function (l) { c.font = '500 ' + l[3] + 'px ' + MONO; w = Math.max(w, c.measureText(l[0]).width); });
    try { c.letterSpacing = '0px'; } catch (e) {}
    var pad = 9, lh = 15, bw = w + pad * 2, bh = lines.length * lh + pad * 2 - 4;
    var bx = left ? sp[0] - 26 - bw : sp[0] + 26, by = sp[1] - bh - 18;
    if (by < hz + 6) by = sp[1] + 18;
    bx = Math.max(8, Math.min(W - bw - 8, bx));
    c.strokeStyle = 'rgba(' + GREY + ',' + (0.35 * a) + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(sp[0], sp[1]); c.lineTo(left ? bx + bw : bx, by + bh / 2); c.stroke();
    c.fillStyle = 'rgba(6,9,15,' + (0.82 * a) + ')'; c.fillRect(bx, by, bw, bh);
    c.strokeStyle = 'rgba(' + GREY + ',' + (0.18 * a) + ')'; c.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    lines.forEach(function (l, i) { label(c, bx + pad, by + pad + 4 + i * lh, l[0], l[1], (a * l[2]).toFixed(3), 'left', l[3]); });
  }

  /* ---------- one call at a time ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mmss(m) { var s = Math.round(m * 60); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function okSpot(x, z) {
    var p = P(x, z);
    if (narrow) { if (p[0] < W * 0.12 || p[0] > W * 0.88 || p[1] < hz + 30 || p[1] > H * 0.42) return false; }
    else if (p[0] < W * 0.48 || p[0] > W * 0.92 || p[1] < hz + 60 || p[1] > H * 0.84) return false;
    if (avoid && p[0] > avoid[0] && p[0] < avoid[2] && p[1] > avoid[1] && p[1] < avoid[3]) return false;
    return true;
  }
  var EV = null, callNo = 0, last = 0;
  function newCall() {
    var x, z, tries = 0, w;
    do {
      var sx = narrow ? rnd(0.15, 0.85) * W : rnd(0.5, 0.9) * W, sy = narrow ? rnd(0.24, 0.4) * H : rnd(0.38, 0.82) * H;
      w = inv(sx, sy); x = snap(w[0], 25); z = Math.max(40, w[1]); tries++;
    } while ((!okSpot(x, z) || (EV && Math.hypot(EV.x - x, EV.z - z) < 120)) && tries < 80);
    var best = -1, bd = 1e9; DOCKS.forEach(function (d, k) { var dd = Math.hypot(d[0] - x, d[1] - z), p = P(d[0], d[1]); if (dd >= 150 && dd <= 450 && dd < bd && (narrow || p[0] > W * 0.45)) { bd = dd; best = k; } });
    if (best < 0) DOCKS.forEach(function (d, k) { var dd = Math.hypot(d[0] - x, d[1] - z); if (dd >= 100 && (best < 0 || dd < bd)) { bd = dd; best = k; } });
    if (best < 0) { best = 0; bd = Math.hypot(DOCKS[0][0] - x, DOCKS[0][1] - z); }
    var st = null, sd = 1e9; STATIONS.forEach(function (s) { var dd = Math.abs(s[0] - x) + Math.abs(s[1] - z); if (dd >= 200 && dd < sd) { sd = dd; st = s; } });
    if (!st) { st = [x - 250, z + 200]; sd = 450; }
    var airMin = 0.5 + (bd / 100) / 0.95;                 // launch + ~57 mph
    var gndMin = 1.4 + (sd / 100) / 0.55 + rnd(0.2, 0.9); // turnout + ~33 mph on surface streets
    gndMin = Math.min(Math.max(gndMin, airMin * 2.5), Math.min(airMin * 4.5, 9.5));
    var type = CALLS[callNo++ % CALLS.length];
    var ns = NS[Math.max(0, Math.min(NS.length - 1, Math.round(x / 100) + 4))], ew = EW[Math.max(0, Math.min(EW.length - 1, Math.round(z / 100)))];
    var tf = 2.3, tg = Math.min(7.2, Math.max(4.2, tf * gndMin / airMin));
    // ground route: along the station's road, then across
    var route = [[st[0], st[1]], [st[0], z], [x, z]];
    EV = { x: x, z: z, dock: best, d: DOCKS[best], st: st, route: route, air: airMin, gnd: gndMin, type: type, where: ns + ' & ' + ew,
           t: 0, tf: tf, tg: tg, launch: 0.9, logged: 0 };
  }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
  function routeLen(r) { var L = 0; for (var i = 1; i < r.length; i++) L += Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1]); return L; }
  function routePt(r, d) { for (var i = 1; i < r.length; i++) { var l = Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1]); if (d <= l) { var t = l ? d / l : 0; return [r[i - 1][0] + (r[i][0] - r[i - 1][0]) * t, r[i - 1][1] + (r[i][1] - r[i - 1][1]) * t, i]; } d -= l; } var e = r[r.length - 1]; return [e[0], e[1], r.length]; }

  function frame(dt) {
    var c = ctx; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
    c.drawImage(base, 0, 0, W, H);
    if (!EV) return;
    var e = EV, t = e.t, end = e.launch + e.tg + 2.4, fade = t > end ? Math.max(0, 1 - (t - end) / 0.8) : Math.min(1, t / 0.25);
    var sp = P(e.x, e.z), a = fade;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // the call
    for (var k = 0; k < 3; k++) {
      var ph = ((t * 0.9 + k / 3) % 1), rr = 4 + ph * 30;
      if (t < e.launch + e.tf + 0.2) { c.strokeStyle = 'rgba(' + RED + ',' + (0.55 * (1 - ph) * a).toFixed(3) + ')'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(sp[0], sp[1], rr, rr * 0.42, 0, 0, 7); c.stroke(); }
    }
    c.fillStyle = 'rgba(' + RED + ',' + (0.95 * a) + ')'; c.beginPath(); c.arc(sp[0], sp[1], 3.2, 0, 7); c.fill();
    // ground unit
    var gp = Math.min(1, Math.max(0, (t - e.launch) / e.tg)), L = routeLen(e.route), gd = L * ease(gp);
    if (t > e.launch) {
      c.setLineDash([4, 5]); c.strokeStyle = 'rgba(' + GREY + ',' + (0.7 * a) + ')'; c.lineWidth = 1.6; c.beginPath();
      var p0 = P(e.route[0][0], e.route[0][1]); c.moveTo(p0[0], p0[1]);
      var rp = routePt(e.route, gd); for (var i = 1; i < rp[2]; i++) { var q = P(e.route[i][0], e.route[i][1]); c.lineTo(q[0], q[1]); }
      var gq = P(rp[0], rp[1]); c.lineTo(gq[0], gq[1]); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(' + GREY + ',' + (0.9 * a) + ')'; c.fillRect(gq[0] - 2.5, gq[1] - 2.5, 5, 5);
    }
    // aircraft
    drawDock(c, e.d, e.dock, t > e.launch - 0.4 && t < e.launch + e.tf ? 1 : 0.35 * a);
    var fp = ease((t - e.launch) / e.tf);
    if (t > e.launch) {
      var dx = e.x - e.d[0], dz = e.z - e.d[1], n = 40, pts = [];
      for (var j = 0; j <= n; j++) { var u = j / n * fp; pts.push(P(e.d[0] + dx * u, e.d[1] + dz * u, Math.sin(Math.PI * u) * 45 + (u < 0.08 ? 0 : 0))); }
      var gr = c.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
      gr.addColorStop(0, 'rgba(' + GOLD + ',' + (0.15 * a) + ')'); gr.addColorStop(1, 'rgba(' + GOLD + ',' + (0.95 * a) + ')');
      c.strokeStyle = gr; c.lineWidth = 2; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]); c.stroke();
      // shadow on the ground
      var sh = P(e.d[0] + dx * fp, e.d[1] + dz * fp);
      c.fillStyle = 'rgba(0,0,0,' + (0.35 * a) + ')'; c.beginPath(); c.ellipse(sh[0], sh[1], 5, 2, 0, 0, 7); c.fill();
      var ac = pts[pts.length - 1];
      c.fillStyle = 'rgba(' + GOLD + ',' + a + ')'; c.beginPath(); c.arc(ac[0], ac[1], 3.4, 0, 7); c.fill();
      c.strokeStyle = 'rgba(' + GOLD + ',' + (0.4 * a) + ')'; c.lineWidth = 1; c.beginPath(); c.arc(ac[0], ac[1], 8, 0, 7); c.stroke();
    }
    // callout: on the side away from the incoming aircraft
    var dp = P(e.d[0], e.d[1]), left = dp[0] > sp[0];
    if (sp[0] < W * 0.2) left = false; if (sp[0] > W * 0.86) left = true;
    var lines = [];
    if (t < e.launch + e.tf) lines.push(['911 · ' + e.type[0] + ' · ' + e.type[1].toUpperCase(), RED, 1, 10.5]);
    else {
      var arr = Math.min(1, (t - e.launch - e.tf) / 0.4);
      c.strokeStyle = 'rgba(' + GOLD + ',' + (0.55 * a * arr) + ')'; c.lineWidth = 1; c.beginPath(); c.ellipse(sp[0], sp[1], 16, 7, 0, 0, 7); c.stroke();
      lines.push(['AIRCRAFT ON SCENE  ' + mmss(e.air), GOLD, arr, 10.5]);
      lines.push(['LIVE VIDEO TO RESPONDERS', GOLD, 0.65 * arr, 9.5]);
      if (gp >= 1) lines.push(['FIRST UNIT ON SCENE  ' + mmss(e.gnd), GREY, Math.min(1, (t - e.launch - e.tg) / 0.4), 10.5]);
      else lines.push(['GROUND UNIT EN ROUTE', GREY, 0.55, 9.5]);
    }
    callout(c, sp, left, lines, a);
    ui(e);
    if (t > end + 1.2) newCall();
  }

  /* ---------- the dispatch panel ---------- */
  var opsLog = document.getElementById('opsLog'), opsClock = document.getElementById('opsClock'), opsUnits = document.getElementById('opsUnits'), opsTts = document.getElementById('opsTts');
  var clock = 10 * 3600 + 24 * 60 + 15;
  function hms(s) { s = Math.floor(s); function p(n) { return (n < 10 ? '0' : '') + n; } return p(Math.floor(s / 3600) % 24) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60); }
  function log(cls, text, ago) {
    if (!opsLog) return;
    var li = document.createElement('li'), tm = document.createElement('time'), sp = document.createElement('span');
    tm.textContent = hms(clock - (ago || 0)); sp.className = cls; sp.textContent = text; li.appendChild(tm); li.appendChild(sp);
    opsLog.insertBefore(li, opsLog.firstChild); while (opsLog.children.length > 5) opsLog.removeChild(opsLog.lastChild);
  }
  function ui(e) {
    var t = e.t;
    if (e.logged < 1) { e.logged = 1; log(e.type[2], e.type[0] + ' · ' + e.type[1] + ' · ' + e.where); }
    if (e.logged < 2 && t > e.launch) { e.logged = 2; log('teal', 'DOCK-' + (e.dock < 9 ? '0' : '') + (e.dock + 1) + ' · launched'); }
    if (e.logged < 3 && t > e.launch + e.tf) { e.logged = 3; log('gold', 'Aircraft on scene ' + mmss(e.air) + ' · video live'); }
    if (e.logged < 4 && t > e.launch + e.tg) { e.logged = 4; log('blue', 'First unit on scene ' + mmss(e.gnd)); }
    var flying = t > e.launch && t < e.launch + e.tf;
    if (opsUnits) { opsUnits.textContent = flying ? '1 IN FLIGHT' : (t > e.launch + e.tf && t < e.launch + e.tg + 2.4 ? '1 ON SCENE' : DOCKS.length + ' ON DOCK'); }
    if (opsTts) {
      var v = t <= e.launch ? '0:00' : mmss(e.air * Math.min(1, (t - e.launch) / e.tf));
      opsTts.textContent = v; opsTts.className = t > e.launch + e.tf ? 'live' : (t < e.launch + e.tf ? 'alert' : '');
    }
  }
  function seed() {
    log('blue', 'P3 · Debris in roadway · cleared from air', 300);
    log('teal', 'DOCK-03 · preflight check passed', 140);
    log('gold', 'Sector 4 · ' + DOCKS.length + ' aircraft on dock · ready', 20);
  }

  /* ---------- run ---------- */
  var running = true, visible = true, raf = 0;
  function tick(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (EV) EV.t += dt;
    clock += dt * 4;
    if (opsClock) opsClock.textContent = hms(clock);
    frame(dt);
    if (running && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && running && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } }
  layout(); seed(); newCall();
  if (REDUCE) { EV.t = EV.launch + EV.tf + 1.2; EV.logged = 0; ui(EV); EV.t = EV.launch + EV.tg + 1; ui(EV); frame(0); running = false; }
  else wake();
  var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(); if (!running) frame(0); }, 150); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; wake(); }).observe(hero);
  document.addEventListener('visibilitychange', wake);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawBase(); });
})();
