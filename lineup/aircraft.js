/* AeroAssist aircraft geometry library (three.js r147, global THREE).
   Units inside each aircraft group are millimetres; the group is scaled to metres.
   Real part dimensions used where published:
   - Vertiq 81-08 G2 module: 87.1 mm dia x 35.3 mm
   - Tattu 6S 25 Ah pack: 208 x 90 x 65 mm
   - Gremsy VIO F1: 173 x 148 x 159 mm
   - Cube flight controller: ~38 x 38 x 22 mm; VOXL 2: 70 x 36 mm
   Frame sizes are design proposals (props 24 in).
*/
(function (root) {
  'use strict';
  const T = root.THREE;
  if (T.ColorManagement && 'legacyMode' in T.ColorManagement) T.ColorManagement.legacyMode = false;

  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (rep) t.repeat.set(rep[0], rep[1]);
    t.anisotropy = 4;
    if (T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    return t;
  }

  function makeMaterials(hullColor, accent) {
    const carbonTex = canvasTex(128, 128, (g, w, h) => {
      const s = 16;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const odd = ((x / s) + (y / s)) % 2;
        const grd = odd ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
        grd.addColorStop(0, '#1a1e25'); grd.addColorStop(0.5, '#2c323c'); grd.addColorStop(1, '#14171d');
        g.fillStyle = grd; g.fillRect(x, y, s, s);
      }
    }, [6, 6]);
    const printTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.07)';
      for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    }, [8, 8]);
    const std = (o) => new T.MeshStandardMaterial(Object.assign({ envMapIntensity: 0.32 }, o));
    return {
      carbon: std({ color: 0xffffff, map: carbonTex, roughness: 0.32, metalness: 0.35 }),
      carbonTube: std({ color: 0x23272e, roughness: 0.28, metalness: 0.45 }),
      hull: std({ color: hullColor, map: printTex, roughness: 0.62, metalness: 0.05 }),
      accent: std({ color: accent, roughness: 0.35, metalness: 0.7 }),
      alu: std({ color: 0x1b1d22, roughness: 0.35, metalness: 0.85 }),
      aluRed: std({ color: 0xc8382c, roughness: 0.35, metalness: 0.7 }),
      silver: std({ color: 0xb9bec6, roughness: 0.3, metalness: 0.9 }),
      gold: std({ color: 0xe2be72, roughness: 0.3, metalness: 0.85 }),
      motor: std({ color: 0x16181c, roughness: 0.4, metalness: 0.6 }),
      prop: std({ color: 0x17191e, roughness: 0.72, metalness: 0.05 }),
      rubber: std({ color: 0x0c0d10, roughness: 0.9, metalness: 0.0 }),
      dark: std({ color: 0x0f1115, roughness: 0.55, metalness: 0.2 }),
      graphite: std({ color: 0x2a2e36, roughness: 0.5, metalness: 0.3 }),
      glass: std({ color: 0x0a1a24, roughness: 0.05, metalness: 0.9 }),
      pcb: std({ color: 0x1f5a3a, roughness: 0.6, metalness: 0.2 }),
      cube: std({ color: 0x2b5fb3, roughness: 0.4, metalness: 0.6 }),
      brass: std({ color: 0xc9a14a, roughness: 0.3, metalness: 0.9 }),
      hose: std({ color: 0x1d2a3a, roughness: 0.7, metalness: 0.0 }),
      tank: new T.MeshPhysicalMaterial({ color: 0xd8c9a0, roughness: 0.25, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.85 }),
      battery: std({ color: 0x15161a, roughness: 0.5, metalness: 0.1 }),
      batteryBand: std({ color: 0xd6a73c, roughness: 0.4, metalness: 0.3 }),
      red: std({ color: 0xff3b30, emissive: 0xff2a1f, emissiveIntensity: 2.2 }),
      green: std({ color: 0x3dd68c, emissive: 0x22d07a, emissiveIntensity: 2.2 }),
      white: std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 }),
      blue: std({ color: 0x3b7bff, emissive: 0x2a66ff, emissiveIntensity: 2.2 }),
      lamp: std({ color: 0xfff6dc, emissive: 0xfff1c8, emissiveIntensity: 1.6 }),
      cable: std({ color: 0x0e0f12, roughness: 0.8 }),
      engine: std({ color: 0x3a3d43, roughness: 0.45, metalness: 0.8 })
    };
  }

  // ---------- primitives ----------
  function mesh(geo, mat) { const m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
  function cyl(r, h, mat, seg, rTop) { return mesh(new T.CylinderGeometry(rTop == null ? r : rTop, r, h, seg || 32), mat); }
  function box(w, h, d, mat) { return mesh(new T.BoxGeometry(w, h, d), mat); }
  function sphere(r, mat, seg) { return mesh(new T.SphereGeometry(r, seg || 24, (seg || 24) * 0.75), mat); }
  function rod(a, b, r, mat, seg) {
    const dir = new T.Vector3().subVectors(b, a); const len = dir.length();
    const m = cyl(r, len, mat, seg || 20);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    return m;
  }
  function decal(tex, w, h, metal) {
    const m = new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, roughness: metal ? 0.3 : 0.55, metalness: metal ? 0.75 : 0.1,
      envMapIntensity: metal ? 0.9 : 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const d = new T.Mesh(new T.PlaneGeometry(w, h), m); d.receiveShadow = true; return d;
  }
  function orient(obj, normal, up) {
    const x = new T.Vector3().crossVectors(up, normal).normalize();
    const y = new T.Vector3().crossVectors(normal, x).normalize();
    obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, normal));
  }
  function polyShape(n, r, rot) {
    const s = new T.Shape();
    for (let i = 0; i <= n; i++) { const a = rot + i * Math.PI * 2 / n; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    return s;
  }
  function polyPath(n, r, rot) {
    const p = new T.Path();
    for (let i = 0; i <= n; i++) { const a = rot + i * Math.PI * 2 / n; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? p.lineTo(x, y) : p.moveTo(x, y); }
    return p;
  }
  // flat polygon slab lying in XZ, from y=0 up to y=t
  function slab(n, r, rot, t, mat, holeR) {
    const s = polyShape(n, r, rot);
    if (holeR) s.holes.push(polyPath(n, holeR, rot));
    const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    return mesh(g, mat);
  }

  function blade(len, mat) {
    const s = new T.Shape();
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) { const u = i / N; const x = 18 + u * (len - 18); const c = (u < 0.3 ? 30 + u / 0.3 * 20 : 50 - (u - 0.3) / 0.7 * 32); pts.push([x, c * 0.55 + u * 6]); }
    s.moveTo(18, -14);
    pts.forEach((p) => s.lineTo(p[0], p[1]));
    for (let i = N; i >= 0; i--) { const u = i / N; const x = 18 + u * (len - 18); const c = (u < 0.3 ? 30 + u / 0.3 * 20 : 50 - (u - 0.3) / 0.7 * 32); s.lineTo(x, -c * 0.45 + u * 6); }
    const g = new T.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 1 });
    g.translate(0, 0, -1.6);
    g.rotateX(Math.PI / 2);            // blade lies in XZ plane
    const m = mesh(g, mat);
    m.rotation.x = -0.18;             // pitch
    return m;
  }

  function prop(len, mats, phase) {
    const g = new T.Group();
    const hub = cyl(14, 12, mats.alu, 24); hub.position.y = 6; g.add(hub);
    const cap = cyl(9, 6, mats.silver, 20); cap.position.y = 15; g.add(cap);
    for (let k = 0; k < 2; k++) {
      const b = blade(len, mats.prop); const h = new T.Group(); h.add(b); h.rotation.y = k * Math.PI; h.position.y = 6; g.add(h);
    }
    g.rotation.y = phase || 0;
    g.userData.isProp = true;
    return g;
  }

  function motor(mats) {
    // Vertiq 81-08 G2 class module: 87.1 mm dia, 35.3 mm tall
    const g = new T.Group();
    const base = cyl(43.5, 22, mats.motor, 40); base.position.y = 11; g.add(base);
    const bell = cyl(42, 13, mats.silver, 40); bell.position.y = 28.8; g.add(bell);
    const ring = cyl(44, 3, mats.alu, 40); ring.position.y = 21.5; g.add(ring);
    const shaft = cyl(6, 8, mats.silver, 16); shaft.position.y = 39; g.add(shaft);
    return g;
  }

  function gpsMast(h, mats) {
    const g = new T.Group();
    const foot = cyl(14, 8, mats.alu, 20); foot.position.y = 4; g.add(foot);
    const pole = cyl(6, h, mats.carbonTube, 16); pole.position.y = h / 2 + 8; g.add(pole);
    const puck = cyl(42, 16, mats.dark, 40); puck.position.y = h + 16; g.add(puck);
    const top = cyl(38, 3, mats.graphite, 40); top.position.y = h + 25.5; g.add(top);
    return g;
  }

  function battery(L, W, H, mats, label) {
    const g = new T.Group();
    const b = box(L, H, W, mats.battery); b.position.y = H / 2; g.add(b);
    const band = box(L * 0.22, H + 1, W + 1, mats.batteryBand); band.position.set(-L * 0.28, H / 2, 0); g.add(band);
    const lead1 = rod(new T.Vector3(L / 2, H * 0.7, 10), new T.Vector3(L / 2 + 40, H * 0.9, 18), 4, mats.red, 10); g.add(lead1);
    const plug = box(22, 12, 30, mats.gold); plug.position.set(L / 2 + 44, H * 0.92, 14); g.add(plug);
    return g;
  }

  function gimbal(mats) {
    // Gremsy VIO F1 envelope 173 x 148 x 159 mm
    const g = new T.Group();
    const top = box(120, 10, 100, mats.alu); top.position.y = -5; g.add(top);
    for (const sx of [-40, 40]) for (const sz of [-35, 35]) { const d = sphere(8, mats.rubber, 12); d.position.set(sx, -14, sz); g.add(d); }
    const yokeTop = box(70, 12, 60, mats.graphite); yokeTop.position.y = -28; g.add(yokeTop);
    for (const sz of [-70, 70]) { const arm = box(24, 80, 14, mats.graphite); arm.position.set(0, -70, sz); g.add(arm); }
    const ball = sphere(66, mats.graphite, 32); ball.position.y = -98; g.add(ball);
    const lens = cyl(26, 20, mats.glass, 32); lens.rotation.z = Math.PI / 2; lens.position.set(62, -92, -18); g.add(lens);
    const ir = cyl(16, 16, mats.glass, 24); ir.rotation.z = Math.PI / 2; ir.position.set(60, -92, 28); g.add(ir);
    const lrf = cyl(7, 10, mats.glass, 16); lrf.rotation.z = Math.PI / 2; lrf.position.set(62, -122, 10); g.add(lrf);
    return g;
  }

  function camModule(mats) {
    const g = new T.Group();
    const b = box(30, 30, 40, mats.dark); g.add(b);
    const l = cyl(9, 6, mats.glass, 20); l.rotation.z = Math.PI / 2; l.position.x = 17; g.add(l);
    return g;
  }

  function spotlight(mats) {
    const g = new T.Group();
    const body = cyl(42, 90, mats.alu, 32); body.rotation.z = Math.PI / 2; g.add(body);
    const fins = cyl(46, 30, mats.graphite, 32); fins.rotation.z = Math.PI / 2; fins.position.x = -30; g.add(fins);
    const face = cyl(38, 3, mats.lamp, 32); face.rotation.z = Math.PI / 2; face.position.x = 46; g.add(face);
    return g;
  }

  function horn(mats) {
    const g = new T.Group();
    const drv = cyl(30, 50, mats.alu, 24); drv.rotation.z = Math.PI / 2; drv.position.x = -55; g.add(drv);
    const bell = mesh(new T.CylinderGeometry(72, 26, 110, 32, 1, true), mats.graphite); bell.material = mats.graphite; bell.rotation.z = -Math.PI / 2; bell.position.x = 25; g.add(bell);
    const grill = cyl(70, 2, mats.dark, 32); grill.rotation.z = Math.PI / 2; grill.position.x = 79; g.add(grill);
    return g;
  }

  function antenna(len, mats) {
    const g = new T.Group();
    const base = cyl(7, 14, mats.alu, 16); g.add(base);
    const whip = cyl(4.5, len, mats.dark, 12); whip.position.y = -len / 2 - 7; g.add(whip);
    return g;
  }

  function landingGear(cfg, mats) {
    const g = new T.Group();
    const top = cfg.plateY, foot = 32, z0 = cfg.gearZ0, z1 = cfg.gearZ1, ax = cfg.gearX, L = cfg.skidL;
    for (const s of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const a = new T.Vector3(sx * ax, top, s * z0), b = new T.Vector3(sx * ax * 1.05, foot, s * z1);
        g.add(rod(a, b, 11, mats.carbonTube));
        const clamp = box(34, 30, 34, mats.hull); clamp.position.set(sx * ax, top - 18, s * z0); g.add(clamp);
        const tee = box(40, 30, 30, mats.hull); tee.position.set(sx * ax * 1.05, foot + 4, s * z1); g.add(tee);
      }
      const sk = rod(new T.Vector3(-L / 2, foot, s * z1), new T.Vector3(L / 2, foot, s * z1), 11, mats.carbonTube);
      g.add(sk);
      for (const e of [-1, 1]) { const cap = cyl(13, 22, mats.rubber, 16); cap.rotation.z = Math.PI / 2; cap.position.set(e * (L / 2 + 8), foot, s * z1); g.add(cap); }
      const brace = rod(new T.Vector3(-ax * 1.02, (top + foot) / 2, s * (z0 + z1) / 2), new T.Vector3(ax * 1.02, (top + foot) / 2, s * (z0 + z1) / 2), 7, mats.carbonTube);
      g.add(brace);
      if (cfg.dockContacts) { for (const e of [-1, 1]) { const c = box(40, 5, 20, mats.gold); c.position.set(e * L * 0.3, foot - 12, s * z1); g.add(c); } }
    }
    const cross = rod(new T.Vector3(0, top - 60, -z0 * 1.02), new T.Vector3(0, top - 60, z0 * 1.02), 7, mats.carbonTube);
    g.add(cross);
    return g;
  }

  // ---------- aircraft ----------
  const MODELS = {
    utility: {
      name: 'Utility Hex', arms: 6, R: 700, plateN: 12, plateR: 230, hullH: 78, plateY: 330, propLen: 305,
      hull: 0xb8322a, accent: 0xb8322a, gearX: 150, gearZ0: 150, gearZ1: 230, skidL: 560,
      tier: 'Tier 3 · Utility'
    },
    responder: {
      name: 'Electric Responder', arms: 8, R: 860, plateN: 8, plateR: 285, hullH: 84, plateY: 380, propLen: 305,
      hull: 0x30353e, accent: 0xc9ced6, gearX: 170, gearZ0: 170, gearZ1: 260, skidL: 640, dockContacts: true,
      tier: 'Tier 2 · Top electric'
    },
    hybrid: {
      name: 'Hybrid Flagship', arms: 8, R: 860, plateN: 8, plateR: 285, hullH: 84, plateY: 400, propLen: 305,
      hull: 0x1c1f25, accent: 0xe2be72, gearX: 180, gearZ0: 175, gearZ1: 270, skidL: 680, dockContacts: true,
      tier: 'Tier 1 · Flagship'
    }
  };

  const STEPS = [
    'Landing gear and bottom plate',
    'Avionics tray: flight controller, radio, power board',
    'Printed hull',
    'Folding arms and clamps',
    'Motors',
    'Top plate',
    'Power',
    'GPS masts, strobe and antennas',
    'Propellers',
    'Payloads'
  ];

  function build(type, opts) {
    opts = opts || {};
    const cfg = Object.assign({}, MODELS[type]);
    const MONO = { hybrid: [0x141619, 0x6f757e], responder: [0x3c4149, 0xb7bcc4], utility: [0x8a8f97, 0x2a2e35] };
    if (opts.livery === 'mono' && MONO[type]) { cfg.hull = MONO[type][0]; cfg.accent = MONO[type][1]; }
    const M = makeMaterials(cfg.hull, cfg.accent);
    const root = new T.Group();
    const parts = [];
    const labels = [];
    function add(obj, step, dir, label, anchor) {
      obj.userData.step = step; obj.userData.dir = dir || new T.Vector3(); obj.userData.base = obj.position.clone();
      root.add(obj); parts.push(obj);
      if (label) labels.push({ obj: obj, text: label, anchor: anchor || new T.Vector3() });
      return obj;
    }
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const y0 = cfg.plateY, H = cfg.hullH, topY = y0 + 3 + H, armY = y0 + 3 + H / 2;
    const n = cfg.arms, R = cfg.R, pr = cfg.plateR;
    const rot = cfg.plateN === 8 ? Math.PI / 8 : Math.PI / 12;  // flats face the arms
    const armAngle = (i) => (n === 6 ? Math.PI / 6 : Math.PI / 8) + i * Math.PI * 2 / n; // forward = +X, arms straddle it

    // Step 0: landing gear + bottom plate
    add(landingGear(cfg, M), 0, V(0, -260, 0), 'Landing gear, carbon skids', V(0, 40, cfg.gearZ1));
    const bottom = slab(cfg.plateN, pr, rot, 3, M.carbon); bottom.position.y = y0; add(bottom, 0, V(0, -140, 0), 'CNC carbon bottom plate', V(pr * 0.7, 3, 0));

    // Step 1: avionics tray
    const tray = new T.Group();
    const tp = slab(cfg.plateN, pr * 0.55, rot, 2.5, M.carbon); tray.add(tp);
    const pdb = box(120, 3, 120, M.pcb); pdb.position.y = 5; tray.add(pdb);
    const cube = box(38, 22, 38, M.cube); cube.position.y = 19; tray.add(cube);
    const carrier = box(90, 6, 60, M.dark); carrier.position.set(0, 9, 0); tray.add(carrier);
    const radio = box(55, 14, 35, M.graphite); radio.position.set(-70, 10, 40); tray.add(radio);
    if (type !== 'utility') { const voxl = box(70, 4, 36, M.pcb); voxl.position.set(-70, 8, -40); tray.add(voxl); const lte = box(50, 10, 30, M.graphite); lte.position.set(70, 8, -45); tray.add(lte); }
    for (let k = 0; k < 4; k++) { const d = sphere(5, M.rubber, 10); const a = k * Math.PI / 2 + Math.PI / 4; d.position.set(Math.cos(a) * pr * 0.4, -3, Math.sin(a) * pr * 0.4); tray.add(d); }
    tray.position.y = y0 + 12;
    add(tray, 1, V(0, 330, 0), type === 'utility' ? 'Cube Blue H7, Mesh Rider radio, power board' : 'Cube Blue H7, VOXL 2, Mesh Rider, LTE', V(0, 30, 0));

    // Step 2: hull
    const hull = slab(cfg.plateN, pr - 2, rot, H, M.hull, pr - 12); hull.position.y = y0 + 3; add(hull, 2, V(0, 120, 0), 'Printed carbon-nylon hull', V(pr - 6, H * 0.6, 0));
    const stripe = slab(cfg.plateN, pr + 0.5, rot, 6, M.accent, pr - 3); stripe.position.y = y0 + 3 + H - 14; add(stripe, 2, V(0, 120, 0));
    const brand = opts.brand;
    if (brand) {
      const ap = (pr - 2) * Math.cos(Math.PI / cfg.plateN) + 0.8;
      const sides = n === 6 ? [Math.PI / 3, -Math.PI / 3, Math.PI] : [Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4, -Math.PI * 3 / 4];
      sides.forEach((phi) => {
        const nrm = V(Math.cos(phi), 0, Math.sin(phi));
        const dcl = n === 6 ? decal(brand.mark, 52, 56, true) : decal(brand.wordWhite, 168, 28, false);
        dcl.position.set(nrm.x * ap, n === 6 ? H * 0.45 : H - 29, nrm.z * ap); orient(dcl, nrm, V(0, 1, 0)); hull.add(dcl);
      });
    }
    // vents
    for (let k = 0; k < cfg.plateN; k++) {
      const a = rot + (k + 0.5) * Math.PI * 2 / cfg.plateN; const flat = pr * Math.cos(Math.PI / cfg.plateN);
      if (k % 2) continue;
      for (let j = 0; j < 3; j++) { const v = box(4, 6, 46, M.dark); v.position.set(Math.cos(a) * (flat + 0.5), y0 + 17 + j * 10, Math.sin(a) * (flat + 0.5)); v.rotation.y = -a; add(v, 2, V(0, 120, 0)); }
    }

    // Step 3 + 4 + 8: arms, motors, props
    for (let i = 0; i < n; i++) {
      const a = armAngle(i); const ca = Math.cos(a), sa = Math.sin(a);
      const out = V(ca, 0, sa);
      const r0 = pr - 30, r1 = R;
      const arm = new T.Group();
      arm.add(rod(V(r0, 0, 0), V(r1, 0, 0), 15, M.carbonTube, 24));
      const clamp = box(62, 44, 46, M.alu); clamp.position.set(pr + 34, 0, 0); arm.add(clamp);
      const knob = cyl(9, 18, M.aluRed, 16); knob.position.set(pr + 34, 30, 0); arm.add(knob);
      const pin = cyl(5, 12, M.gold, 12); pin.rotation.x = Math.PI / 2; pin.position.set(pr + 34, 0, 26); arm.add(pin);
      const sleeve = cyl(18, 50, M.alu, 24); sleeve.rotation.z = Math.PI / 2; sleeve.position.set(pr + 95, 0, 0); arm.add(sleeve);
      const mount = box(70, 24, 56, M.alu); mount.position.set(r1, 14, 0); arm.add(mount);
      const nav = sphere(7, i === 0 ? M.green : (i === n - 1 ? M.red : M.white), 12); nav.position.set(r1, -14, 0); arm.add(nav);
      arm.position.y = armY; arm.rotation.y = -a;
      add(arm, 3, out.clone().multiplyScalar(170), i === 0 ? 'Carbon arm, folding clamp, gold lock pin' : null, V(pr + 34, 30, 0));
      const mo = motor(M); mo.position.set(ca * r1, armY + 26, sa * r1); add(mo, 4, V(ca * 120, 140, sa * 120), i === 1 ? 'Vertiq 81-08 G2 motor + ESC' : null, V(0, 40, 0));
      const pp = prop(cfg.propLen, M, i * 0.9 + (i % 2) * 0.7); pp.position.set(ca * r1, armY + 26 + 42, sa * r1); pp.userData.spinDir = (i % 2 ? 1 : -1);
      add(pp, 8, V(ca * 60, 300, sa * 60), i === 2 ? '24 in folding carbon props' : null, V(0, 10, 0));
    }

    // Step 5: top plate
    const top = slab(cfg.plateN, pr, rot, 3, M.carbon); top.position.y = topY; add(top, 5, V(0, 260, 0), 'Sealed CNC carbon top plate', V(-pr * 0.5, 3, pr * 0.3));
    if (opts.brand && n === 8) { const mk = decal(opts.brand.mark, 102, 110, true); mk.position.set(132, 3.4, 0); orient(mk, V(0, 1, 0), V(1, 0, 0)); top.add(mk); }
    for (let k = 0; k < cfg.plateN * 2; k++) { const a = rot + k * Math.PI / cfg.plateN; const b = cyl(4.5, 3, M.silver, 10); b.position.set(Math.cos(a) * (pr - 14), topY + 4.5, Math.sin(a) * (pr - 14)); add(b, 5, V(0, 260, 0)); }

    // Step 6: power
    if (type === 'utility') {
      // semi-solid-state 6S 25 Ah: 198 x 77 x 61 mm, 1,921 g
      for (const z of [-45, 45]) {
        const bt = battery(198, 77, 61, M); bt.position.set(-10, topY + 3 + 12, z); add(bt, 6, V(0, 420, z * 2), z < 0 ? 'Semi-solid-state 6S 25 Ah ×2 (12S)' : null, V(0, 66, 0));
      }
      for (const x of [-80, 60]) { const rail = box(16, 12, 190, M.alu); rail.position.set(x, topY + 3 + 6, 0); add(rail, 6, V(0, 380, 0)); }
      const latch = box(24, 30, 190, M.accent); latch.position.set(98, topY + 3 + 20, 0); add(latch, 6, V(0, 400, 0));
      if (opts.brand) { const wm = decal(opts.brand.wordWhite, 168, 28, false); wm.position.set(12.6, 0, 0); orient(wm, V(1, 0, 0), V(0, 1, 0)); latch.add(wm); }
    } else if (type === 'responder') {
      const bay = new T.Group();
      const shell = box(440, 100, 230, M.hull); shell.position.y = -52; bay.add(shell);
      const lip = box(450, 6, 240, M.accent); lip.position.y = -4; bay.add(lip);
      for (const z of [-55, 55]) { const p = battery(208, 90, 65, M); p.position.set(-110, -95, z); bay.add(p); const p2 = battery(208, 90, 65, M); p2.position.set(110, -95, z); bay.add(p2); }
      bay.children.forEach((c) => { if (c.type === 'Group') c.visible = false; });
      bay.position.y = y0 - 4;
      add(bay, 6, V(0, -330, 0), 'Battery bay: 2× 12S packs, hot-swap', V(220, -50, 0));
      const packs = new T.Group();
      for (const x of [-110, 110]) for (const z of [-50, 50]) { const p = battery(208, 90, 65, M); p.position.set(x, 0, z); packs.add(p); }
      packs.position.y = y0 - 92; packs.userData.explodeOnly = true;
      add(packs, 6, V(0, -560, 0));
    } else {
      const pod = new T.Group();
      const shell = box(470, 130, 250, M.hull); shell.position.y = -66; pod.add(shell);
      const lip = box(480, 6, 260, M.accent); lip.position.y = -4; pod.add(lip);
      for (let k = 0; k < 6; k++) { const v = box(6, 50, 4, M.dark); v.position.set(-150 + k * 22, -60, 126); pod.add(v); }
      const exh = rod(V(-235, -90, 60), V(-300, -105, 70), 16, M.silver); pod.add(exh);
      pod.position.y = y0 - 4;
      add(pod, 6, V(0, -340, 0), 'Hybrid pod: genset, fuel tank, buffer battery', V(235, -60, 0));
      const gen = new T.Group();
      const eng = cyl(55, 150, M.engine, 32); eng.rotation.z = Math.PI / 2; gen.add(eng);
      for (let k = 0; k < 9; k++) { const f = cyl(66, 4, M.engine, 32); f.rotation.z = Math.PI / 2; f.position.x = -60 + k * 15; gen.add(f); }
      const g2 = cyl(66, 120, M.silver, 32); g2.rotation.z = Math.PI / 2; g2.position.x = 140; gen.add(g2);
      const cap = cyl(40, 18, M.gold, 32); cap.rotation.z = Math.PI / 2; cap.position.x = 208; gen.add(cap);
      const muff = rod(V(-80, -10, 70), V(-200, -30, 80), 22, M.silver, 20); gen.add(muff);
      gen.position.set(-60, y0 - 80, -40); gen.userData.explodeOnly = true;
      add(gen, 6, V(0, -560, -120), null);
      const tank = box(180, 90, 150, M.tank); tank.position.set(120, y0 - 70, 55); tank.userData.explodeOnly = true; add(tank, 6, V(80, -560, 160));
      const buf = battery(150, 70, 55, M); buf.position.set(-150, y0 - 100, 70); buf.userData.explodeOnly = true; add(buf, 6, V(-120, -560, 160));
    }

    // Step 7: GPS masts, strobe, antennas
    for (const x of [pr - 50, -(pr - 50)]) { const m = gpsMast(120, M); m.position.set(x, topY + 3, 0); add(m, 7, V(0, 380, 0), x > 0 ? 'Dual RTK GPS masts' : null, V(0, 140, 0)); }
    const strobeBase = cyl(16, 14, M.dark, 20); strobeBase.position.set(-pr * 0.35, topY + 10, -pr * 0.35); add(strobeBase, 7, V(0, 380, 0));
    const strobe = sphere(12, M.white, 16); strobe.position.set(-pr * 0.35, topY + 22, -pr * 0.35); add(strobe, 7, V(0, 380, 0), 'Anti-collision strobe', V(0, 14, 0));
    for (const z of [-1, 1]) { const an = antenna(150, M); an.position.set(-cfg.gearX * 1.0 - 10, y0 - 80, z * (cfg.gearZ0 + 25)); add(an, 7, V(-140, -120, z * 80), z > 0 ? 'Mesh Rider radio antennas' : null, V(0, -150, 0)); }

    // Step 9: payloads
    if (type === 'utility') {
      // robotic swivel lance: servo pan/tilt head under the nose
      const head = new T.Group();
      const base = box(90, 26, 90, M.alu); head.add(base);
      const pan = cyl(34, 30, M.graphite, 32); pan.position.y = -28; head.add(pan);
      const tiltBody = box(70, 46, 60, M.alu); tiltBody.position.y = -64; head.add(tiltBody);
      for (const z of [-34, 34]) { const servo = cyl(16, 12, M.aluRed, 20); servo.rotation.x = Math.PI / 2; servo.position.set(0, -64, z); head.add(servo); }
      head.position.set(pr - 40, y0 - 13, 0);
      add(head, 9, V(260, -120, 0), 'Robotic swivel head (pan + tilt)', V(0, -64, 40));
      const lance = new T.Group();
      lance.add(rod(V(0, 0, 0), V(640, -70, 0), 11, M.carbonTube));
      const sw = cyl(16, 30, M.brass, 20); sw.rotation.z = Math.PI / 2; sw.position.set(4, 0, 0); lance.add(sw);
      const noz = cyl(6, 46, M.brass, 16, 14); noz.rotation.z = -Math.PI / 2 + 0.11; noz.position.set(662, -73, 0); lance.add(noz);
      const valve = box(56, 38, 38, M.alu); valve.position.set(70, -8, 0); lance.add(valve);
      const vtag = box(57, 6, 39, M.gold); vtag.position.set(70, 12, 0); lance.add(vtag);
      const pcam = camModule(M); pcam.position.set(130, 26, 0); lance.add(pcam);
      lance.position.set(pr - 4, y0 - 77, 0);
      add(lance, 9, V(340, -120, 0), 'Carbon lance, automatic spray valve, quick-change tip', V(560, -50, 0));
      // obstacle-avoidance radar (in today's package)
      const radar = new T.Group();
      const panel = box(24, 70, 90, M.graphite); radar.add(panel);
      const face = box(3, 62, 82, M.dark); face.position.x = 13; radar.add(face);
      const dot = box(4, 8, 8, M.green); dot.position.set(14, 26, 34); radar.add(dot);
      radar.position.set(pr + 10, y0 + 3 + H * 0.5, 0);
      add(radar, 9, V(240, 0, 0), 'Obstacle radar + wall-distance hold', V(14, 30, 0));
      const hoseCurve = new T.CatmullRomCurve3([V(pr - 4, y0 - 80, 0), V(pr - 110, y0 - 150, 30), V(40, y0 - 260, 60), V(-120, 120, 140), V(-260, 6, 220), V(-520, 6, 320)]);
      const hose = mesh(new T.TubeGeometry(hoseCurve, 80, 9, 12, false), M.hose); add(hose, 9, V(0, -200, 0), 'Hose from ground pump + power tether', V(-260, 30, 220));
      const tether = mesh(new T.TubeGeometry(new T.CatmullRomCurve3([V(-20, y0 - 4, 0), V(-30, y0 - 200, 40), V(-160, 100, 170), V(-280, 8, 240), V(-560, 8, 340)]), 80, 5, 10, false), M.cable); add(tether, 9, V(0, -200, 0));
    } else {
      const bayBottom = type === 'hybrid' ? y0 - 140 : y0 - 108;
      const gim = gimbal(M); gim.position.set(cfg.plateR - 40, y0 - 2, 0); add(gim, 9, V(320, -200, 0), 'Gremsy VIO F1: 20× zoom + 640 thermal + rangefinder', V(60, -100, 0));
      const spot = spotlight(M); spot.rotation.z = -0.35; spot.position.set(cfg.plateR - 120, bayBottom + 10, 150); add(spot, 9, V(200, -250, 160), 'Spotlight, follows the camera', V(40, 0, 0));
      const hn = horn(M); hn.rotation.z = -0.5; hn.position.set(cfg.plateR - 140, bayBottom + 10, -150); add(hn, 9, V(200, -250, -160), 'Loudspeaker and siren horn', V(60, 0, 0));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2; const flat = (pr - 2);
        const cm = camModule(M); cm.position.set(Math.cos(a) * (flat * 0.93 + 18), y0 + 3 + H * 0.45, Math.sin(a) * (flat * 0.93 + 18)); cm.rotation.y = -a;
        add(cm, 9, V(Math.cos(a) * 200, 0, Math.sin(a) * 200), k === 1 ? '360° HD camera ×4' : null, V(0, 20, 0));
      }
      // light bar segments around the lower hull edge
      for (let k = 0; k < cfg.plateN; k++) {
        const a0 = rot + k * Math.PI * 2 / cfg.plateN, a1 = rot + (k + 1) * Math.PI * 2 / cfg.plateN;
        const p0 = V(Math.cos(a0) * (pr + 2), y0 + 8, Math.sin(a0) * (pr + 2)), p1 = V(Math.cos(a1) * (pr + 2), y0 + 8, Math.sin(a1) * (pr + 2));
        const mid = p0.clone().lerp(p1, 0.5); const len = p0.distanceTo(p1) * 0.6;
        const seg = box(len, 8, 6, k % 2 ? M.blue : M.red); seg.position.copy(mid); seg.rotation.y = -(a0 + a1) / 2 + Math.PI / 2;
        add(seg, 9, V(0, 60, 0), k === 0 ? 'Light bar: red / blue / white' : null, V(0, 0, 0));
      }
      const chute = new T.Group();
      const can = cyl(68, 110, M.graphite, 40); can.position.y = 55; chute.add(can);
      const capc = cyl(72, 14, M.accent, 40); capc.position.y = 117; chute.add(capc);
      chute.position.set(-30, topY + 3, 0); add(chute, 9, V(0, 520, 0), 'Parachute, ASTM F3322', V(0, 130, 0));
      const winch = new T.Group();
      const wb = box(150, 56, 100, M.alu); winch.add(wb);
      const drum = cyl(26, 70, M.silver, 24); drum.rotation.x = Math.PI / 2; drum.position.y = -30; winch.add(drum);
      const line = cyl(1.5, 20, M.cable, 6); line.position.y = -66; winch.add(line);
      const podp = box(170, 100, 120, M.hull); podp.position.y = -126; winch.add(podp);
      const podb = box(174, 10, 124, M.accent); podb.position.y = -168; winch.add(podb);
      winch.position.set(-150, bayBottom - 34, 0);
      add(winch, 9, V(-100, -330, 0), type === 'hybrid' ? 'Winch + 3 kg supply pod' : 'Winch + 2 kg supply pod', V(0, -170, 60));
    }

    // scale to metres, and put on the ground
    root.scale.setScalar(0.001);
    return { group: root, parts: parts, labels: labels, steps: STEPS, cfg: cfg, materials: M,
      dims: { wheelbase: 2 * R, height: topY + 150, propDia: 2 * cfg.propLen } };
  }

  // explode e in [0,1]; stepLimit: show parts with step <= stepLimit (null = all); stepE: animation of the current step
  function pose(model, e, stepLimit, currentE) {
    model.parts.forEach((p) => {
      const st = p.userData.step;
      let k = e;
      if (stepLimit != null) {
        p.visible = st <= stepLimit;
        k = st === stepLimit ? (currentE == null ? 0 : currentE) : 0;
        if (st < stepLimit) k = 0;
      } else p.visible = true;
      if (p.userData.explodeOnly) p.visible = p.visible && (k > 0.05 || (stepLimit != null && st <= stepLimit && e > 0.05));
      p.position.copy(p.userData.base).addScaledVector(p.userData.dir, k);
    });
  }

  root.AeroAircraft = { build: build, pose: pose, MODELS: MODELS, STEPS: STEPS };
})(window);
