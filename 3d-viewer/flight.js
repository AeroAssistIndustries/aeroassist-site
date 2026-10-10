/* AeroAssist flight mode for the 3D studio (three.js r147, global THREE; needs aircraft.js).
   A simplified, game-style flight model: position-hold handling, on-screen twin sticks, keyboard and
   gamepad input, synthesised motor sound, lights, and the payload functions each aircraft carries.
   It is a demonstration. Speeds and handling here are not performance figures. */
(function (root) {
  'use strict';
  const T = root.THREE;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const expo = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  const G = 9.81, CEILING = 120, GEOFENCE = 140, HOSE = 40;
  const PUMP = { x: 0.4, z: 4.4 };
  // x, z = centre; w = size along x; d = size along z; h = height (metres)
  const BUILDINGS = [
    { x: 22, z: 0, w: 8, d: 16, h: 14 },
    { x: -40, z: 30, w: 14, d: 12, h: 18 },
    { x: -55, z: -25, w: 18, d: 14, h: 10 },
    { x: 35, z: -50, w: 12, d: 20, h: 24 },
    { x: 60, z: 35, w: 16, d: 16, h: 8 },
    { x: -10, z: -70, w: 24, d: 10, h: 12 },
    { x: 5, z: 65, w: 12, d: 12, h: 30 }
  ];
  const PANEL = { x: 17.96, y0: 1.5, y1: 9.5, z0: -5, z1: 5, cols: 20, rows: 16 };   // wash target on the first building
  const HIKER_SPOTS = [[-50, 44], [-66, -38], [48, -66], [72, 48], [-16, -82]];
  const TUNE = {
    utility: { vmax: 8, rthAlt: 16 },
    responder: { vmax: 15, rthAlt: 34 },
    hybrid: { vmax: 15, rthAlt: 34 }
  };
  const ZOOMS = [1, 4, 10, 20];
  const CAMS = ['chase', 'nose', 'orbit'];
  const CAM_NAME = { chase: 'CHASE', nose: 'NOSE', orbit: 'ORBIT' };

  // ------------------------------------------------------------------ sound
  function makeAudio() {
    let ctx = null, master = null, n = null, on = true, suspended = false;
    function init() {
      if (ctx) return true;
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
      try { ctx = new AC(); } catch (e) { ctx = null; return false; }
      master = ctx.createGain(); master.gain.value = on ? 0.6 : 0;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
      const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
      const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
      n = {};
      // motors: blade-pass tone from slightly detuned voices (the beating is what makes a multirotor sound like one)
      n.mLp = filt('lowpass', 500, 0.9); n.mG = gain(0); n.mLp.connect(n.mG); n.mG.connect(master);
      n.voices = [['sawtooth', 1, 0.42], ['sawtooth', 1.014, 0.34], ['sawtooth', 0.985, 0.34], ['square', 2.02, 0.12], ['triangle', 0.5, 0.5]].map((v) => {
        const o = osc(v[0], 60), g = gain(v[2]); o.connect(g); g.connect(n.mLp); return { o: o, ratio: v[1] };
      });
      // prop wash
      n.wBp = filt('bandpass', 700, 0.7); n.wG = gain(0); noise().connect(n.wBp); n.wBp.connect(n.wG); n.wG.connect(master);
      // hybrid generator
      n.eLp = filt('lowpass', 420, 1.2); n.eG = gain(0); n.e1 = osc('sawtooth', 92); n.e2 = osc('square', 46);
      n.e1.connect(n.eLp); const e2g = gain(0.6); n.e2.connect(e2g); e2g.connect(n.eLp); n.eLp.connect(n.eG); n.eG.connect(master);
      // siren: slow wail
      n.sO = osc('square', 960); n.sLp = filt('lowpass', 2400, 0.7); n.sG = gain(0);
      const lfo = osc('sine', 0.32), lfoG = gain(360); lfo.connect(lfoG); lfoG.connect(n.sO.frequency);
      n.sO.connect(n.sLp); n.sLp.connect(n.sG); n.sG.connect(master);
      // spray hiss
      n.pHp = filt('highpass', 1900, 0.6); n.pG = gain(0); noise().connect(n.pHp); n.pHp.connect(n.pG); n.pG.connect(master);
      // winch
      n.wiO = osc('sawtooth', 190); n.wiBp = filt('bandpass', 900, 2); n.wiG = gain(0); n.wiO.connect(n.wiBp); n.wiBp.connect(n.wiG); n.wiG.connect(master);
      n.noise = noise;
      return true;
    }
    const set = (p, v, tc) => p.setTargetAtTime(v, ctx.currentTime, tc || 0.07);
    return {
      unlock() { if (!init()) return; if (ctx.state === 'suspended' && !suspended) ctx.resume(); },
      setOn(v) { on = v; if (ctx) set(master.gain, on ? 0.6 : 0, 0.05); },
      pause(p) { suspended = p; if (!ctx) return; if (p) ctx.suspend(); else if (ctx.state === 'suspended') ctx.resume(); },
      update(s) {
        if (!ctx || ctx.state !== 'running') return;
        const lv = s.level, f = 36 + 98 * lv;
        n.voices.forEach((v) => set(v.o.frequency, f * v.ratio, 0.05));
        set(n.mLp.frequency, 320 + 1900 * lv, 0.08);
        set(n.mG.gain, lv > 0.02 ? 0.05 + 0.2 * lv : 0, 0.09);
        set(n.wBp.frequency, 450 + 1500 * lv, 0.1);
        set(n.wG.gain, lv > 0.02 ? 0.015 + 0.13 * lv * lv + Math.min(0.06, s.speed * 0.004) : 0, 0.1);
        set(n.eG.gain, s.engine ? 0.1 : 0, 0.25);
        set(n.e1.frequency, 88 + 22 * lv, 0.3); set(n.e2.frequency, 44 + 11 * lv, 0.3);
        set(n.sG.gain, s.siren ? 0.085 : 0, 0.04);
        set(n.pG.gain, s.spray ? 0.11 : 0, 0.05);
        set(n.wiG.gain, s.winch ? 0.05 : 0, 0.04);
      },
      beep(freq, at, dur, vol) {
        if (!ctx) return;
        const t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.12, t + 0.012);
        g.gain.setTargetAtTime(0, t + (dur || 0.09), 0.02); o.connect(g); g.connect(master); o.start(t); o.stop(t + (dur || 0.09) + 0.2);
      },
      armTones() { [523, 659, 784].forEach((f, i) => this.beep(f, i * 0.13, 0.09, 0.1)); },
      pop() {
        if (!ctx) return;
        const s = n.noise(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        g.gain.setValueAtTime(0.5, ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 0.18);
        s.connect(lp); lp.connect(g); g.connect(master); s.stop(ctx.currentTime + 1.2);
      }
    };
  }

  // ------------------------------------------------------------------ flight mode
  function create(o) {
    const scene = o.scene, camera = o.camera, renderer = o.renderer, controls = o.controls, ui = o.ui;
    const q = (s) => ui.querySelector(s);
    const el = {
      alt: q('#tAlt'), spd: q('#tSpd'), hdg: q('#tHdg'), home: q('#tHome'), homeA: q('#tHomeA'), tgt: q('#tTgt'), tgtV: q('#tTgtV'), tgtA: q('#tTgtA'), extra: q('#tExtra'), status: q('#fStatus'), again: q('#fAgain'),
      obj: q('#fObj'), fns: q('#fFns'), map: q('#fMap'), toast: q('#fToast'), go: q('#fGo'), ret: q('#fRet'), retTag: q('#fRetTag'),
      modelName: q('#fModelName'), exit: q('#fExit'), model: q('#fModel'), sL: q('#stickL'), sR: q('#stickR')
    };
    const audio = makeAudio();
    const V3 = T.Vector3;
    const v1 = new V3(), v2 = new V3(), v3 = new V3(), camT = new V3(), qa = new T.Quaternion(), qb = new T.Quaternion();
    const Y_AXIS = new V3(0, 1, 0);
    const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);   // no flashing lights
    const coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);                // phone or tablet
    const host = ui.parentElement;
    const buzz = (ms) => { if (coarse && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

    let active = false, model = null, fx = null, type = 'utility', tune = TUNE.utility, world = null;
    let cam = 'chase', zoomIdx = 0, fovNow = 50;
    const rig = { cg: 0.4, r: 1.2, chaseDist: 6, chaseH: 1.9 };
    const S = { zoomK: 1, pos: new V3(), vel: new V3(), yaw: 0, yawRate: 0, pitch: 0, roll: 0, level: 0, mode: 'landed', armed: false, spool: 0, t: 0, gimbal: -0.45, groundT: 0, rthT: 0, landHome: false, lastPos: new V3() };
    const F = { lights: true, spot: false, bar: false, siren: false, thermal: false, spray: false, hold: false, sound: true };
    const W = { state: 'stowed', len: 0 };
    const chute = { open: 0, collapse: 0 };
    const M = { stage: 0, done: false, t0: 0, tEnd: 0, pct: 0, text: '' };
    const saved = {};

    const craft = new T.Group(), tilt = new T.Group(); craft.add(tilt); craft.visible = false; scene.add(craft);

    // ---------------------------------------------------------------- helpers
    function tex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
    }
    function groundAt(x, z, y) {
      let g = 0;
      for (let i = 0; i < BUILDINGS.length; i++) { const b = BUILDINGS[i]; if (Math.abs(x - b.x) <= b.w / 2 + 0.2 && Math.abs(z - b.z) <= b.d / 2 + 0.2 && y >= b.h - 0.35 && b.h > g) g = b.h; }
      return g;
    }
    function insideBuilding(x, y, z, pad) {
      for (let i = 0; i < BUILDINGS.length; i++) { const b = BUILDINGS[i]; if (y < b.h + pad && Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad) return true; }
      return false;
    }
    const alt = () => S.pos.y - groundAt(S.pos.x, S.pos.z, S.pos.y);
    const airborne = () => S.mode !== 'landed' && S.mode !== 'spool' && alt() > 0.3;
    let toastT = 0;
    function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('show'); toastT = 2.6; }

    // ---------------------------------------------------------------- world
    function buildWorld() {
      const g = new T.Group(); g.visible = false; scene.add(g);
      const w = { group: g, beacons: [] };

      const skyT = tex(8, 256, (c, cw, ch) => {
        const gr = c.createLinearGradient(0, 0, 0, ch);
        gr.addColorStop(0, '#03050a'); gr.addColorStop(0.36, '#090e18'); gr.addColorStop(0.495, '#202b3e'); gr.addColorStop(0.52, '#141b28'); gr.addColorStop(1, '#141b28');
        c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
      });
      w.sky = new T.Mesh(new T.SphereGeometry(900, 24, 16), new T.MeshBasicMaterial({ map: skyT, side: T.BackSide, fog: false, depthWrite: false }));
      w.sky.renderOrder = -2; g.add(w.sky);
      const r = rng(11), sp = [];
      for (let i = 0; i < 320; i++) { const a = r() * Math.PI * 2, e = 0.12 + r() * 1.4; sp.push(Math.cos(a) * Math.cos(e) * 850, Math.sin(e) * 850, Math.sin(a) * Math.cos(e) * 850); }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
      w.stars = new T.Points(sg, new T.PointsMaterial({ color: 0xcdd6e6, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
      w.stars.renderOrder = -1; g.add(w.stars);

      const gt = tex(256, 256, (c, s) => {
        c.fillStyle = '#0c1017'; c.fillRect(0, 0, s, s);
        const rr = rng(3); for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(255,255,255,' + (rr() * 0.035) + ')'; c.fillRect(rr() * s, rr() * s, 2, 2); }
        c.strokeStyle = 'rgba(214,220,228,0.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke();
        c.strokeStyle = 'rgba(214,220,228,0.2)'; c.lineWidth = 3; c.strokeRect(0, 0, s, s);
      });
      gt.wrapS = gt.wrapT = T.RepeatWrapping; gt.repeat.set(100, 100);
      const ground = new T.Mesh(new T.PlaneGeometry(1000, 1000), new T.MeshStandardMaterial({ map: gt, roughness: 0.94, metalness: 0, envMapIntensity: 0.1 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);

      const padT = tex(512, 512, (c, s) => {
        c.clearRect(0, 0, s, s); c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); c.fillStyle = '#121720'; c.fill();
        c.lineWidth = 14; c.strokeStyle = '#e2be72'; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 26, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 3; c.strokeStyle = 'rgba(226,190,114,0.5)'; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 62, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#f4f6f8'; c.font = '800 220px Oxanium, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save(); c.translate(s / 2, s / 2 + 8); c.rotate(-Math.PI / 2); c.fillText('H', 0, 0); c.restore();
      });
      const pad = new T.Mesh(new T.CircleGeometry(2.8, 56), new T.MeshStandardMaterial({ map: padT, transparent: true, roughness: 0.8, envMapIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.012; pad.receiveShadow = true; g.add(pad);
      w.padLights = [];
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, pl = new T.Mesh(new T.SphereGeometry(0.04, 8, 6), new T.MeshBasicMaterial({ color: 0x5bede2 })); pl.scale.y = 0.5; pl.position.set(Math.cos(a) * 2.92, 0.03, Math.sin(a) * 2.92); g.add(pl); w.padLights.push(pl); }

      function facade(seed, rx, ry) {
        const r1 = rng(seed), cols = 10, rows = 4, Wd = 160, cw = Wd / cols, ch = Wd / rows, lit = [];
        for (let i = 0; i < cols * rows; i++) lit.push(r1() < 0.17 ? 0.3 + r1() * 0.6 : 0);
        const paint = (em) => tex(Wd, Wd, (c) => {
          c.fillStyle = em ? '#000' : '#11151d'; c.fillRect(0, 0, Wd, Wd);
          for (let i = 0; i < lit.length; i++) {
            const x = (i % cols) * cw + 3, y = Math.floor(i / cols) * ch + 6;
            c.fillStyle = em ? 'rgba(255,214,150,' + lit[i] + ')' : (lit[i] ? '#3a3020' : '#070a0f');
            if (!em || lit[i]) c.fillRect(x + 1, y + 4, cw - 8, ch - 22);
          }
        });
        const map = paint(false), emm = paint(true);
        [map, emm].forEach((t) => { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); });
        return new T.MeshStandardMaterial({ map: map, emissiveMap: emm, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.12 });
      }
      const roofM = new T.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.9, envMapIntensity: 0.1 });
      const edgeM = new T.LineBasicMaterial({ color: 0xe2be72, transparent: true, opacity: 0.3 });
      const beaconM = new T.MeshBasicMaterial({ color: 0xff3b30 });
      BUILDINGS.forEach((b, i) => {
        const mx = facade(100 + i, b.d / 12, b.h / 12), mz = facade(200 + i, b.w / 12, b.h / 12);
        const geo = new T.BoxGeometry(b.w, b.h, b.d);
        const m = new T.Mesh(geo, [mx, mx, roofM, roofM, mz, mz]); m.position.set(b.x, b.h / 2, b.z); m.receiveShadow = true; g.add(m);
        const e = new T.LineSegments(new T.EdgesGeometry(geo), edgeM); e.position.copy(m.position); g.add(e);
        if (b.h >= 18) { const bc = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), beaconM.clone()); bc.position.set(b.x, b.h + 0.3, b.z); g.add(bc); w.beacons.push(bc); }
      });

      // wash target: a pale panel under a layer of grime that the spray removes
      const pw = PANEL.z1 - PANEL.z0, ph = PANEL.y1 - PANEL.y0;
      w.wash = new T.Group(); g.add(w.wash);
      const clean = new T.Mesh(new T.PlaneGeometry(pw, ph), new T.MeshStandardMaterial({ color: 0xa9afb9, roughness: 0.7, emissive: 0x1c2028, envMapIntensity: 0.2 }));
      clean.rotation.y = -Math.PI / 2; clean.position.set(PANEL.x + 0.02, (PANEL.y0 + PANEL.y1) / 2, 0); w.wash.add(clean);
      const gc = document.createElement('canvas'); gc.width = 240; gc.height = 192;
      w.grimeCtx = gc.getContext('2d'); w.grimeTex = new T.CanvasTexture(gc); w.grimeTex.encoding = T.sRGBEncoding;
      const grime = new T.Mesh(new T.PlaneGeometry(pw, ph), new T.MeshStandardMaterial({ map: w.grimeTex, transparent: true, roughness: 1, envMapIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      grime.rotation.y = -Math.PI / 2; grime.position.set(PANEL.x, (PANEL.y0 + PANEL.y1) / 2, 0); w.wash.add(grime);
      const frame = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(pw + 0.3, ph + 0.3)), new T.LineBasicMaterial({ color: 0x5bede2 }));
      frame.rotation.y = -Math.PI / 2; frame.position.set(PANEL.x - 0.02, (PANEL.y0 + PANEL.y1) / 2, 0); w.wash.add(frame);
      w.cells = new Uint8Array(PANEL.cols * PANEL.rows);

      // ground pump cart and the hose that follows the Utility Hex
      w.pump = new T.Group(); w.pump.position.set(PUMP.x, 0, PUMP.z); g.add(w.pump);
      const cartM = new T.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.3 });
      const body = new T.Mesh(new T.BoxGeometry(0.9, 0.5, 0.6), cartM); body.position.y = 0.42; body.castShadow = true; w.pump.add(body);
      const band = new T.Mesh(new T.BoxGeometry(0.92, 0.08, 0.62), new T.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.5 })); band.position.y = 0.6; w.pump.add(band);
      [[-0.32, 0.31], [0.32, 0.31], [-0.32, -0.31], [0.32, -0.31]].forEach((p) => { const wh = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.08, 16), new T.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9 })); wh.rotation.x = Math.PI / 2; wh.position.set(p[0], 0.16, p[1]); w.pump.add(wh); });
      w.hose = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({ color: 0x24364c, roughness: 0.7, envMapIntensity: 0.2 })); w.hose.frustumCulled = false; g.add(w.hose);

      // spray particles
      const NP = 520; w.sprayN = NP; w.sprayI = 0;
      w.sprayPos = new Float32Array(NP * 3).fill(-999); w.sprayVel = new Float32Array(NP * 3); w.sprayLife = new Float32Array(NP);
      const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(w.sprayPos, 3));
      const dropT = tex(32, 32, (c, s) => { const gr = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, s, s); });
      w.spray = new T.Points(pg, new T.PointsMaterial({ color: 0xd6f1ff, map: dropT, size: 0.2, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending }));
      w.spray.frustumCulled = false; g.add(w.spray);

      // missing hiker
      w.hikerMat = new T.MeshStandardMaterial({ color: 0x1a1e25, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0 });
      w.hiker = new T.Group(); g.add(w.hiker);
      const torso = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 0.62, 12), w.hikerMat); torso.position.y = 0.5; w.hiker.add(torso);
      const hd = new T.Mesh(new T.SphereGeometry(0.14, 12, 10), w.hikerMat); hd.position.y = 0.96; w.hiker.add(hd);
      const legs = new T.Mesh(new T.BoxGeometry(0.75, 0.2, 0.36), w.hikerMat); legs.position.set(0.36, 0.11, 0); w.hiker.add(legs);
      w.ring = new T.Mesh(new T.RingGeometry(2.4, 2.65, 48), new T.MeshBasicMaterial({ color: 0x5bede2, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
      w.ring.rotation.x = -Math.PI / 2; w.ring.position.y = 0.03; w.ring.visible = false; w.hiker.add(w.ring);

      // delivered pod
      w.drop = new T.Group(); w.drop.visible = false; g.add(w.drop);
      w.dropBody = new T.Mesh(new T.BoxGeometry(0.17, 0.1, 0.12), roofM); w.dropBody.position.y = 0.06; w.dropBody.castShadow = true; w.drop.add(w.dropBody);
      w.dropBand = new T.Mesh(new T.BoxGeometry(0.174, 0.012, 0.124), roofM); w.dropBand.position.y = 0.012; w.drop.add(w.dropBand);

      // spotlight, light-bar wash lights, parachute: these ride with the aircraft
      w.spotL = new T.SpotLight(0xfff0cf, 0, 110, 0.3, 0.5, 1); g.add(w.spotL); g.add(w.spotL.target);
      const cg = new T.ConeGeometry(Math.tan(0.2) * 26, 26, 28, 1, true); cg.translate(0, -13, 0);
      const cc = []; for (let i = 0; i < cg.attributes.position.count; i++) { const k = 1 + cg.attributes.position.getY(i) / 26; cc.push(k, k * 0.95, k * 0.82); }
      cg.setAttribute('color', new T.Float32BufferAttribute(cc, 3));
      w.cone = new T.Mesh(cg, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.035, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      w.cone.visible = false; w.cone.frustumCulled = false; g.add(w.cone);
      w.barR = new T.PointLight(0xff2a1f, 0, 16, 1.4); w.barB = new T.PointLight(0x2a66ff, 0, 16, 1.4);
      w.barR.position.set(0.25, 0.3, 0.3); w.barB.position.set(0.25, 0.3, -0.3); craft.add(w.barR); craft.add(w.barB);

      const canT = tex(256, 16, (c, cw, ch) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#e2be72' : '#f4f6f8'; c.fillRect(i * cw / 8, 0, cw / 8, ch); } });
      w.canopy = new T.Group(); w.canopy.visible = false; craft.add(w.canopy);
      const dome = new T.Mesh(new T.SphereGeometry(1.7, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ map: canT, side: T.DoubleSide, roughness: 0.8, envMapIntensity: 0.3 }));
      dome.scale.y = 0.55; dome.position.y = 3.3; dome.castShadow = true; w.canopy.add(dome);
      const lp = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; lp.push(Math.cos(a) * 1.7, 3.3, Math.sin(a) * 1.7, 0, 0.35, 0); }
      const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
      w.canopy.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xcdd2da, transparent: true, opacity: 0.6 })));
      return w;
    }

    function paintGrime() {
      const c = world.grimeCtx, cw = 240, ch = 192, r = rng(41);
      c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, cw, ch);
      c.fillStyle = 'rgba(40,36,27,0.97)'; c.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 90; i++) { const v = 14 + r() * 34; c.fillStyle = 'rgba(' + (v * 1.12 | 0) + ',' + (v | 0) + ',' + (v * 0.74 | 0) + ',' + (0.25 + r() * 0.4) + ')'; c.beginPath(); c.ellipse(r() * cw, r() * ch, 6 + r() * 26, 4 + r() * 14, r() * 3, 0, Math.PI * 2); c.fill(); }
      for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(12,14,10,' + (0.2 + r() * 0.3) + ')'; c.fillRect(r() * cw, 0, 2 + r() * 5, 40 + r() * 150); }
      world.grimeTex.needsUpdate = true; world.cells.fill(0); M.pct = 0;
    }
    function cleanAt(y, z) {
      const u = (z - PANEL.z0) / (PANEL.z1 - PANEL.z0), v = (y - PANEL.y0) / (PANEL.y1 - PANEL.y0), c = world.grimeCtx, R = 0.85;
      const px = u * 240, py = (1 - v) * 192, pr = R * 24;
      c.globalCompositeOperation = 'destination-out';
      const gr = c.createRadialGradient(px, py, pr * 0.35, px, py, pr); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill(); world.grimeDirty = true;
      const cs = (PANEL.z1 - PANEL.z0) / PANEL.cols; let n = 0;
      for (let j = 0; j < PANEL.rows; j++) for (let i = 0; i < PANEL.cols; i++) {
        const cz = PANEL.z0 + (i + 0.5) * cs, cy = PANEL.y0 + (j + 0.5) * cs, k = j * PANEL.cols + i;
        if (!world.cells[k] && Math.hypot(cz - z, cy - y) < R * 0.8) world.cells[k] = 1;
        n += world.cells[k];
      }
      M.pct = n / world.cells.length;
    }

    // ---------------------------------------------------------------- function buttons
    function fnList() {
      const common = [{ id: 'lights', label: 'LIGHTS', key: 'L', sys: 1 }, { id: 'cam', label: 'CAMERA', key: 'C', sys: 1 }, { id: 'home', label: 'HOME', key: 'H', sys: 1 }, { id: 'sound', label: 'SOUND', key: 'M', sys: 1 }];
      if (type === 'utility') return [{ id: 'spray', label: 'SPRAY', key: '1' }, { id: 'hold', label: 'WALL HOLD', key: '2' }].concat(common);
      return [{ id: 'spot', label: 'SPOTLIGHT', key: '1' }, { id: 'bar', label: 'LIGHT BAR', key: '2' }, { id: 'siren', label: 'SIREN', key: '3' }, { id: 'zoom', label: 'ZOOM', key: '4' },
        { id: 'thermal', label: 'THERMAL', key: '5' }, { id: 'winch', label: 'WINCH', key: '6' }, { id: 'chute', label: 'PARACHUTE', key: '7' }].concat(common);
    }
    let fns = [];
    function buildButtons() {
      fns = fnList(); el.fns.textContent = '';
      const grp = (cls, label) => { const d = document.createElement('div'); d.className = 'fgrp ' + cls; d.setAttribute('role', 'group'); d.setAttribute('aria-label', label); el.fns.appendChild(d); return d; };
      const gPay = grp('pay', 'Payload functions'), gSys = grp('sys', 'Lights, camera, home and sound');
      fns.forEach((f) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ffn'; b.dataset.fn = f.id;
        const s = document.createElement('span'); s.textContent = f.label; const k = document.createElement('kbd'); k.textContent = f.key; b.appendChild(s); b.appendChild(k);
        b.addEventListener('click', () => { act(f.id); b.blur(); }); (f.sys ? gSys : gPay).appendChild(b); f.node = b; f.text = s;
      });
      syncButtons();
    }
    function syncButtons() {
      fns.forEach((f) => {
        let on = null, label = f.label;
        if (f.id in F) on = F[f.id];
        if (f.id === 'cam') label = 'CAM ' + CAM_NAME[cam];
        if (f.id === 'zoom') { label = 'ZOOM ' + ZOOMS[zoomIdx] + '×'; on = cam === 'nose' && zoomIdx > 0; }
        if (f.id === 'home') on = S.mode === 'rth';
        if (f.id === 'winch') { label = W.state === 'lowering' ? 'WINCH ▼' : W.state === 'raising' || W.state === 'retract' ? 'WINCH ▲' : W.state === 'empty' ? 'POD OUT' : 'WINCH'; on = W.state === 'lowering' || W.state === 'raising' || W.state === 'retract'; }
        if (f.id === 'chute') on = S.mode === 'chute' || chute.collapse > 0;
        if (on !== null) f.node.setAttribute('aria-pressed', String(!!on));
        if (f.text.textContent !== label) f.text.textContent = label;
      });
      const go = S.mode === 'landed' ? 'TAKE OFF' : S.mode === 'land' ? 'CANCEL' : S.mode === 'chute' ? 'PARACHUTE' : 'LAND';
      if (el.go.textContent !== go) el.go.textContent = go;
      el.go.disabled = S.mode === 'chute';
    }

    function setCam(c) {
      cam = c; controls.enabled = c === 'orbit';
      if (c !== 'nose') { F.thermal = false; }
      if (c === 'orbit') { controls.target.set(S.pos.x, S.pos.y + rig.cg, S.pos.z); controls.update(); }
      camSnap = true;
    }
    let camSnap = true;

    function takeoff() {
      if (S.mode !== 'landed') return;
      if (chute.collapse > 0) { chute.collapse = 0; world.canopy.visible = false; }
      S.armed = true; S.mode = 'spool'; S.spool = 0; audio.armTones();
      if (!M.t0) M.t0 = S.t;
      toast('Motors starting');
    }
    function setLanded(msg) { buzz(18); S.mode = 'landed'; S.armed = false; S.vel.set(0, 0, 0); S.pos.y = groundAt(S.pos.x, S.pos.z, S.pos.y); S.groundT = 0; S.landHome = false; if (msg) toast(msg); }

    function act(id) {
      audio.unlock(); buzz(8);
      switch (id) {
        case 'go':
          if (S.mode === 'landed') takeoff();
          else if (S.mode === 'land') { S.mode = 'fly'; toast('Landing cancelled'); }
          else if (S.mode !== 'chute') { S.mode = 'land'; S.landHome = false; toast('Landing'); }
          break;
        case 'lights': F.lights = !F.lights; break;
        case 'spot': F.spot = !F.spot; break;
        case 'bar': F.bar = !F.bar; if (!F.bar) F.siren = false; break;
        case 'siren': F.siren = !F.siren; if (F.siren) F.bar = true; break;
        case 'zoom': if (cam !== 'nose') setCam('nose'); else zoomIdx = (zoomIdx + 1) % ZOOMS.length; break;
        case 'thermal': F.thermal = !F.thermal; if (F.thermal && cam !== 'nose') { setCam('nose'); F.thermal = true; } break;
        case 'spray': F.spray = !F.spray; break;
        case 'hold': F.hold = !F.hold; toast(F.hold ? 'Wall hold on: stays 3 m off walls' : 'Wall hold off'); break;
        case 'cam': setCam(CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]); toast(cam === 'chase' ? 'Chase camera' : cam === 'nose' ? (fx.gimbalHead ? 'Onboard camera: drag to tilt' : 'Lance camera') : 'Orbit camera: drag to look around'); break;
        case 'home':
          if (S.mode === 'rth') { S.mode = 'fly'; toast('Return home cancelled'); }
          else if (S.mode === 'fly' || S.mode === 'takeoff' || S.mode === 'land') { S.mode = 'rth'; S.rthT = 0; toast('Returning home'); }
          else if (S.mode === 'landed') toast('Already on the ground');
          break;
        case 'sound': F.sound = !F.sound; audio.setOn(F.sound); break;
        case 'winch':
          if (!fx.winch) break;
          if (W.state === 'empty') toast('Pod is out. Land on the pad to reload');
          else if (!airborne()) toast('Take off first');
          else if (W.state === 'lowering') { W.state = 'raising'; toast('Raising the pod'); }
          else if (W.state === 'stowed' || W.state === 'raising') { W.state = 'lowering'; toast('Lowering the supply pod'); }
          break;
        case 'chute':
          if (!fx.chuteCan || S.mode === 'chute') break;
          if (!airborne() || alt() < 4) { toast('Parachute needs 4 m of height'); break; }
          S.mode = 'chute'; S.armed = false; chute.open = 0; chute.collapse = 0; world.canopy.visible = true; world.canopy.scale.set(0.05, 0.05, 0.05); audio.pop();
          if (W.state === 'lowering') W.state = 'raising';
          toast('Parachute out: motors cut');
          break;
      }
      syncButtons();
    }

    // ---------------------------------------------------------------- input
    const touch = { lx: 0, ly: 0, rx: 0, ry: 0 }, kin = { lx: 0, ly: 0, rx: 0, ry: 0 }, pad = { lx: 0, ly: 0, rx: 0, ry: 0, tilt: 0 }, I = { lx: 0, ly: 0, rx: 0, ry: 0 };
    const keys = {}, padPrev = [];
    let padSeen = false;
    function bindStick(node, ax, ay) {
      let pid = null; const knob = node.querySelector('.knob');
      const set = (e) => {
        const r = node.getBoundingClientRect(), R = r.width / 2, m = R * 0.6; let x = e.clientX - (r.left + R), y = e.clientY - (r.top + R);
        const d = Math.hypot(x, y); if (d > m) { x *= m / d; y *= m / d; } touch[ax] = x / m; touch[ay] = -y / m;
      };
      const end = (e) => { if (e.pointerId !== pid) return; pid = null; touch[ax] = 0; touch[ay] = 0; };
      node.addEventListener('pointerdown', (e) => { node.classList.remove('pulse'); if (pid !== null) return; pid = e.pointerId; try { node.setPointerCapture(pid); } catch (er) {} set(e); e.preventDefault(); audio.unlock(); });
      node.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
      node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end); node.addEventListener('lostpointercapture', end);
      node.addEventListener('contextmenu', (e) => e.preventDefault());
      return (x, y) => { const m = node.clientWidth / 2 * 0.6; knob.style.transform = 'translate(' + (x * m).toFixed(1) + 'px,' + (-y * m).toFixed(1) + 'px)'; };
    }
    const drawL = bindStick(el.sL, 'lx', 'ly'), drawR = bindStick(el.sR, 'rx', 'ry');
    const HELD = { KeyW: 1, KeyS: 1, KeyA: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyR: 1, KeyF: 1 };
    const PRESS = { KeyL: 'lights', KeyC: 'cam', KeyH: 'home', KeyM: 'sound', Space: 'go' };
    function onKey(e, down) {
      if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
      const c = e.code;
      if (HELD[c]) { keys[c] = down; e.preventDefault(); if (down) audio.unlock(); return; }
      let id = PRESS[c];
      if (!id && /^Digit\d$/.test(c)) { const f = fns.find((x) => x.key === c.slice(5)); if (f) id = f.id; }
      if (c === 'Escape' && down) { o.onExit(); return; }
      if (!id) return;
      e.preventDefault();
      if (down && !e.repeat) act(id);
    }
    root.addEventListener('keydown', (e) => onKey(e, true));
    root.addEventListener('keyup', (e) => onKey(e, false));
    root.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!active || cam !== 'nose' || !fx || !fx.gimbalHead) return;
      let ly = e.clientY; const id = e.pointerId;
      const mv = (ev) => { if (ev.pointerId !== id) return; S.gimbal = clamp(S.gimbal - (ev.clientY - ly) * 0.005 / Math.sqrt(ZOOMS[zoomIdx]), -1.45, 0.3); ly = ev.clientY; };
      const up = (ev) => { if (ev.pointerId !== id) return; root.removeEventListener('pointermove', mv); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); };
      root.addEventListener('pointermove', mv); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    });
    const pts = new Map(); let pinch0 = 0, zoom0 = 1;
    const cv = renderer.domElement, pdist = () => { const a = Array.from(pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    cv.addEventListener('pointerdown', (e) => { if (!active) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { pinch0 = pdist(); zoom0 = S.zoomK; } });
    cv.addEventListener('pointermove', (e) => { if (!active || !pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && cam === 'chase' && pinch0 > 10) S.zoomK = clamp(zoom0 * pinch0 / pdist(), 0.6, 3.2); });
    const pend = (e) => { pts.delete(e.pointerId); };
    cv.addEventListener('pointerup', pend); cv.addEventListener('pointercancel', pend); cv.addEventListener('pointerleave', pend);
    cv.addEventListener('wheel', (e) => { if (!active || cam !== 'chase') return; e.preventDefault(); S.zoomK = clamp(S.zoomK * Math.exp(e.deltaY * 0.0012), 0.6, 3.2); }, { passive: false });
    // phones: keep the browser from zooming or scrolling the page while flying
    document.addEventListener('gesturestart', (e) => { if (active) e.preventDefault(); });
    ui.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
    ui.addEventListener('contextmenu', (e) => e.preventDefault());

    function readPad() {
      pad.lx = pad.ly = pad.rx = pad.ry = pad.tilt = 0;
      const list = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected && list[i].axes.length >= 4) { gp = list[i]; break; }
      if (!gp) return;
      if (!padSeen) { padSeen = true; toast('Gamepad connected'); }
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
      pad.lx = dz(gp.axes[0]); pad.ly = -dz(gp.axes[1]); pad.rx = dz(gp.axes[2]); pad.ry = -dz(gp.axes[3]);
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), hit = (i) => { const p = b(i), was = padPrev[i]; padPrev[i] = p; return p && !was; };
      pad.tilt = (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0);
      const f1 = fns[0] && fns[0].id, f2 = fns[1] && fns[1].id;
      if (hit(0) || hit(9)) act('go'); if (hit(1)) act('home'); if (hit(2) && f1) act(f1); if (hit(3)) act('cam');
      if (hit(4)) act('lights'); if (hit(5) && f2) act(f2);
      if (type !== 'utility') { if (hit(12)) act('zoom'); if (hit(13)) act('thermal'); if (hit(14)) act('siren'); if (hit(15)) act('winch'); }
    }
    function readInput(dt) {
      const k = Math.min(1, dt * 7), ax = (p, n) => (keys[p] ? 1 : 0) - (keys[n] ? 1 : 0);
      kin.lx += (ax('KeyD', 'KeyA') - kin.lx) * k; kin.ly += (ax('KeyW', 'KeyS') - kin.ly) * k;
      kin.rx += (ax('ArrowRight', 'ArrowLeft') - kin.rx) * k; kin.ry += (ax('ArrowUp', 'ArrowDown') - kin.ry) * k;
      readPad();
      I.lx = expo(clamp(touch.lx + kin.lx + pad.lx, -1, 1)); I.ly = expo(clamp(touch.ly + kin.ly + pad.ly, -1, 1));
      I.rx = expo(clamp(touch.rx + kin.rx + pad.rx, -1, 1)); I.ry = expo(clamp(touch.ry + kin.ry + pad.ry, -1, 1));
      drawL(clamp(touch.lx + kin.lx + pad.lx, -1, 1), clamp(touch.ly + kin.ly + pad.ly, -1, 1));
      drawR(clamp(touch.rx + kin.rx + pad.rx, -1, 1), clamp(touch.ry + kin.ry + pad.ry, -1, 1));
      const tiltIn = ax('KeyR', 'KeyF') + pad.tilt;
      if (tiltIn && fx && fx.gimbalHead) S.gimbal = clamp(S.gimbal + tiltIn * dt * 0.9 / Math.sqrt(ZOOMS[zoomIdx]), -1.45, 0.3);
    }
    el.go.addEventListener('click', () => { act('go'); el.go.blur(); });
    el.again.addEventListener('click', () => { resetFlight(); toast('New mission'); el.again.blur(); });
    el.exit.addEventListener('click', () => o.onExit());
    el.model.addEventListener('click', () => { o.onNextModel(); el.model.blur(); });
    document.addEventListener('visibilitychange', () => { if (active) audio.pause(document.hidden); });

    // ---------------------------------------------------------------- attach / detach the aircraft
    function attach(m) {
      model = m; fx = m.fx; type = fx.type; tune = TUNE[type];
      root.AeroAircraft.pose(model, 0, null);
      if (fx.groundLines) fx.groundLines.forEach((p) => { p.visible = false; });
      const grp = model.group; grp.position.set(0, 0, 0); grp.rotation.set(0, 0, 0); grp.updateMatrixWorld(true);
      const bb = new T.Box3();
      grp.traverse((n) => { if (n.isMesh) { let vis = true, p = n; while (p) { if (!p.visible) { vis = false; break; } p = p.parent; } if (vis) bb.expandByObject(n); } });
      const lift = -bb.min.y + 0.005, c = model.cfg;
      rig.cg = (c.plateY + 3 + c.hullH / 2) / 1000 + lift; rig.r = model.dims.wheelbase / 2000 + 0.31;
      rig.chaseDist = 2.5 + model.dims.wheelbase / 1000 * 1.4; rig.chaseH = 1.45;
      scene.remove(grp); tilt.position.y = rig.cg; grp.position.y = lift - rig.cg; tilt.add(grp);
      fx.propMat.transparent = true;
      fx.props.forEach((p) => { if (p.userData.disc) p.userData.disc.visible = true; });
      world.pump.visible = world.hose.visible = world.wash.visible = type === 'utility';
      world.hiker.visible = type !== 'utility';
      if (fx.winch) { world.dropBody.material = fx.winch.hullMat; world.dropBand.material = fx.winch.accentMat; }
      el.modelName.textContent = c.name;
      ui.classList.toggle('has-gimbal', !!fx.gimbalHead);
      buildButtons(); resetFlight();
    }
    function detach() {
      if (!model) return;
      const grp = model.group; tilt.remove(grp); grp.position.set(0, 0, 0); scene.add(grp);
      fx.propMat.transparent = false; fx.propMat.opacity = 1; fx.discMat.opacity = 0;
      fx.props.forEach((p) => { if (p.userData.disc) p.userData.disc.visible = false; });
      fx.navGlows.forEach((gl) => { gl.visible = false; }); fx.strobeGlow.visible = false;
      fx.navG.emissiveIntensity = fx.navR.emissiveIntensity = 2.2; fx.navW.emissiveIntensity = fx.strobeMat.emissiveIntensity = 2.0; fx.lampMat.emissiveIntensity = 1.6;
      fx.bar.forEach((s) => { s.mat.emissiveIntensity = 2.2; });
      if (fx.gimbalHead) fx.gimbalHead.rotation.z = 0;
      if (fx.spot) fx.spot.rotation.z = -0.35;
      if (fx.winch) { setWinchGeom(0); fx.winch.hang.quaternion.identity(); fx.winch.pod.forEach((p) => { p.visible = true; }); }
      model = null; fx = null;
    }
    function setWinchGeom(len) {
      const L = len * 1000, wn = fx.winch, th = len > 0.01 ? 3 : 1;
      wn.line.scale.set(th, (20 + L) / 20, th); wn.line.position.y = -(20 + L) / 2;
      wn.pod[0].position.y = -70 - L; wn.pod[1].position.y = -112 - L;
    }
    function resetFlight() {
      S.pos.set(0, 0, 0); S.vel.set(0, 0, 0); S.yaw = 0; S.yawRate = 0; S.pitch = S.roll = 0; S.level = 0; S.mode = 'landed'; S.armed = false; S.gimbal = -0.45; S.t = 0;
      Object.assign(F, { lights: true, spot: false, bar: false, siren: false, thermal: false, spray: false, hold: false });
      W.state = 'stowed'; W.len = 0; chute.open = chute.collapse = 0; world.canopy.visible = false; world.drop.visible = false; zoomIdx = 0;
      M.stage = 0; M.done = false; M.t0 = 0; M.tEnd = 0; M.pct = 0; M.text = ''; el.again.hidden = true; S.zoomK = 1;
      el.sL.classList.add('pulse'); el.sR.classList.add('pulse');
      if (type === 'utility') paintGrime();
      else { const s = HIKER_SPOTS[Math.floor(Math.random() * HIKER_SPOTS.length)]; world.hiker.position.set(s[0], 0, s[1]); world.hiker.rotation.y = Math.random() * 6.28; world.ring.visible = false; }
      world.sprayPos.fill(-999); world.spray.geometry.attributes.position.needsUpdate = true;
      if (fx.winch) { setWinchGeom(0); fx.winch.pod.forEach((p) => { p.visible = true; }); }
      setCam('chase'); syncButtons(); camSnap = true;
    }

    // ---------------------------------------------------------------- per-frame simulation
    function simulate(dt) {
      const fx_ = Math.cos(S.yaw), fz = -Math.sin(S.yaw), rx = Math.sin(S.yaw), rz = Math.cos(S.yaw);
      let gH = groundAt(S.pos.x, S.pos.z, S.pos.y);
      const onGround = S.pos.y <= gH + 0.012;
      let vdx = 0, vdz = 0, climb = 0, yawCmd = 0, ctrl = true;
      const stickActive = Math.abs(I.lx) + Math.abs(I.ly) + Math.abs(I.rx) + Math.abs(I.ry) > 0.12;
      const stickVel = (k) => { vdx = (fx_ * I.ry + rx * I.rx) * tune.vmax * k; vdz = (fz * I.ry + rz * I.rx) * tune.vmax * k; };

      if (S.mode === 'landed') { ctrl = false; if (I.ly > 0.55) takeoff(); }
      else if (S.mode === 'spool') { ctrl = false; S.spool += dt; if (S.spool > 1.15) { S.mode = 'takeoff'; toast('Lift off'); } }
      else if (S.mode === 'takeoff') { stickVel(0.5); yawCmd = -I.lx * 1.7; climb = Math.max(2, I.ly * 4.5); if (S.pos.y - gH >= 2.5) S.mode = 'fly'; }
      else if (S.mode === 'fly') {
        stickVel(1); yawCmd = -I.lx * 1.75; climb = I.ly > 0 ? I.ly * 4.5 : I.ly * 3.5;
        if (onGround && I.ly < -0.25) { S.groundT += dt; if (S.groundT > 0.4) setLanded('Landed'); } else S.groundT = 0;
      } else if (S.mode === 'land') {
        if (S.landHome) { vdx = -S.pos.x * 1.2; vdz = -S.pos.z * 1.2; } else stickVel(0.3);
        yawCmd = -I.lx * 1.2; climb = S.pos.y - gH > 3 ? -2.4 : -0.9;
        if (I.ly > 0.5) { S.mode = 'fly'; toast('Landing cancelled'); }
        else if (onGround) setLanded('Landed');
      } else if (S.mode === 'rth') {
        S.rthT += dt;
        if (stickActive && S.rthT > 0.6) { S.mode = 'fly'; toast('Return home cancelled'); }
        else {
          const dx = -S.pos.x, dz = -S.pos.z, dist = Math.hypot(dx, dz);
          if (dist > 1) {
            const need = S.pos.y < tune.rthAlt - 0.3; climb = need ? Math.min(3.2, (tune.rthAlt - S.pos.y) * 1.2 + 0.4) : 0;
            if (S.pos.y > tune.rthAlt - 2.5 || dist < 6) { const sp = Math.min(Math.min(9, tune.vmax), 0.6 + dist * 0.7); vdx = dx / dist * sp; vdz = dz / dist * sp; }
            if (dist > 4) yawCmd = clamp(angDiff(Math.atan2(-dz, dx), S.yaw) * 2, -1.5, 1.5);
          } else { S.mode = 'land'; S.landHome = true; toast('Home: landing'); }
        }
      }

      if (S.mode === 'chute') {
        chute.open = Math.min(1, chute.open + dt * 2.2);
        S.vel.y += (-4.3 - S.vel.y) * Math.min(1, dt * (0.6 + chute.open * 1.6)); S.vel.x *= Math.exp(-0.7 * dt); S.vel.z *= Math.exp(-0.7 * dt);
        S.roll = 0.11 * Math.sin(S.t * 1.7) * chute.open; S.pitch = 0.09 * Math.sin(S.t * 1.3 + 1) * chute.open; S.yawRate *= Math.exp(-dt);
        const s = 0.05 + 0.95 * sstep(0, 1, chute.open); world.canopy.scale.set(s, s, s); world.canopy.rotation.z = -S.roll * 0.6;
        if (onGround && S.vel.y <= 0) { setLanded('Down under parachute'); chute.collapse = 2.4; }
      } else if (ctrl) {
        // velocity controller: the aircraft tilts toward the speed asked for and tilts back to brake
        let ax = (vdx - S.vel.x) * 1.7, az = (vdz - S.vel.z) * 1.7; const amax = G * Math.tan(0.5), am = Math.hypot(ax, az);
        if (am > amax) { ax *= amax / am; az *= amax / am; }
        if (onGround && climb <= 0) { ax = az = 0; S.vel.x *= Math.exp(-8 * dt); S.vel.z *= Math.exp(-8 * dt); }
        const pT = Math.atan((ax * fx_ + az * fz) / G), rT = Math.atan((ax * rx + az * rz) / G), kt = Math.min(1, dt * 6.5);
        S.pitch += (pT - S.pitch) * kt; S.roll += (rT - S.roll) * kt;
        const aF = G * Math.tan(S.pitch), aR = G * Math.tan(S.roll);
        if (!(onGround && climb <= 0)) { S.vel.x += (fx_ * aF + rx * aR - S.vel.x * 0.1) * dt; S.vel.z += (fz * aF + rz * aR - S.vel.z * 0.1) * dt; }
        if (S.pos.y >= CEILING && climb > 0) climb = 0;
        S.vel.y += (climb - S.vel.y) * Math.min(1, dt * 3.4);
        S.yawRate += (yawCmd - S.yawRate) * Math.min(1, dt * 8);
      } else { S.pitch *= Math.exp(-6 * dt); S.roll *= Math.exp(-6 * dt); S.vel.set(0, 0, 0); S.yawRate = 0; }
      if (chute.collapse > 0) { chute.collapse -= dt; const s = clamp(chute.collapse / 1.6, 0, 1); world.canopy.scale.set(1, 0.08 + 0.92 * s, 1); world.canopy.rotation.z = 0; if (chute.collapse <= 0) world.canopy.visible = false; }

      S.yaw += S.yawRate * dt;
      S.pos.x += S.vel.x * dt; S.pos.y += S.vel.y * dt; S.pos.z += S.vel.z * dt;

      // buildings: slide along walls; wall hold keeps a 3 m stand-off
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 1 && !(F.hold && type === 'utility')) break;
        const m = pass === 0 ? rig.r + 0.3 : 3, rate = pass === 0 ? 7 : 2.4;
        for (let i = 0; i < BUILDINGS.length; i++) {
          const b = BUILDINGS[i]; if (S.pos.y >= b.h - 0.05) continue;
          const dx = S.pos.x - b.x, dz = S.pos.z - b.z, px = b.w / 2 + m - Math.abs(dx), pz = b.d / 2 + m - Math.abs(dz);
          if (px <= 0 || pz <= 0) continue;
          if (px < pz) { const s = dx >= 0 ? 1 : -1; S.pos.x += s * Math.min(px, dt * rate); if (S.vel.x * s < 0) S.vel.x = 0; }
          else { const s = dz >= 0 ? 1 : -1; S.pos.z += s * Math.min(pz, dt * rate); if (S.vel.z * s < 0) S.vel.z = 0; }
        }
      }
      const rr = Math.hypot(S.pos.x, S.pos.z);
      if (rr > GEOFENCE) { const k = GEOFENCE / rr; S.pos.x *= k; S.pos.z *= k; const vn = (S.vel.x * S.pos.x + S.vel.z * S.pos.z) / GEOFENCE; if (vn > 0) { S.vel.x -= vn * S.pos.x / GEOFENCE; S.vel.z -= vn * S.pos.z / GEOFENCE; } if (toastT <= 0) toast('Geofence: edge of the flight area'); }
      if (type === 'utility') {
        v1.set(S.pos.x - PUMP.x, S.pos.y + rig.cg - 0.6, S.pos.z - PUMP.z); const d = v1.length(), lim = HOSE - 1;
        if (d > lim) { v1.multiplyScalar(1 / d); const over = d - lim; S.pos.x -= v1.x * over; S.pos.y -= v1.y * over; S.pos.z -= v1.z * over; const vn = S.vel.dot(v1); if (vn > 0) S.vel.addScaledVector(v1, -vn); if (toastT <= 0) toast('Hose limit: 40 m from the pump'); }
        S.hoseOut = Math.min(d, HOSE);
      }
      gH = groundAt(S.pos.x, S.pos.z, S.pos.y);
      if (S.pos.y < gH) { S.pos.y = gH; if (S.vel.y < 0) S.vel.y = 0; }

      // motor effort drives prop speed and sound
      let lv = 0;
      if (S.armed) {
        if (S.mode === 'spool') lv = 0.3;
        else lv = clamp(0.5 + 0.055 * S.vel.y + 0.04 * (climb - S.vel.y) + 0.55 * (Math.abs(S.pitch) + Math.abs(S.roll)) + 0.03 * Math.abs(S.yawRate), 0.24, 1);
      }
      S.level += (lv - S.level) * Math.min(1, dt * (lv > S.level ? 5 : 2.6));
    }

    function updatePayloads(dt) {
      const flying = S.mode !== 'landed' && S.mode !== 'spool';
      // nav lights and strobe
      const ph = S.t % 1.25, flash = F.lights && (calm || ph < 0.06 || (ph > 0.17 && ph < 0.23));
      fx.navG.emissiveIntensity = fx.navR.emissiveIntensity = F.lights ? 2.6 : 0.04; fx.navW.emissiveIntensity = F.lights ? 1.3 : 0.04;
      fx.navGlows.forEach((g) => { g.visible = F.lights; });
      fx.strobeMat.emissiveIntensity = flash ? (calm ? 1.6 : 7) : 0.05; fx.strobeGlow.visible = flash && !calm;
      // props
      const blur = sstep(0.12, 0.45, S.level);
      fx.propMat.opacity = 1 - 0.82 * blur; fx.discMat.opacity = 0.11 * blur;
      for (let i = 0; i < fx.props.length; i++) fx.props[i].rotation.y += (fx.props[i].userData.spinDir || 1) * dt * S.level * 105;

      if (fx.gimbalHead) {
        fx.gimbalHead.rotation.z = S.gimbal; fx.spot.rotation.z = Math.min(S.gimbal, 0.1);
        // spotlight follows the camera line of sight
        fx.spot.getWorldPosition(v1); const cp = Math.cos(S.gimbal), fxx = Math.cos(S.yaw), fzz = -Math.sin(S.yaw);
        v2.set(cp * fxx, Math.sin(S.gimbal), cp * fzz);
        world.spotL.intensity = F.spot ? 5.5 : 0; world.spotL.position.copy(v1); world.spotL.target.position.copy(v1).addScaledVector(v2, 10); world.spotL.target.updateMatrixWorld();
        world.cone.visible = F.spot && cam !== 'nose'; world.cone.position.copy(v1); world.cone.quaternion.setFromUnitVectors(v3.set(0, -1, 0), v2);
        fx.lampMat.emissiveIntensity = F.spot ? 5 : 0.12;
        // light bar: alternating red / blue, about 2.4 changes a second
        const half = calm ? 2 : Math.floor(S.t * 2.4) % 2;
        fx.bar.forEach((s) => { s.mat.emissiveIntensity = F.bar ? (half === 2 ? 2.6 : (s.blue ? half === 1 : half === 0) ? 5 : 0.08) : 0.12; });
        world.barR.intensity = F.bar ? (half === 2 ? 1.3 : half === 0 ? 2.6 : 0) : 0; world.barB.intensity = F.bar ? (half === 2 ? 1.3 : half === 1 ? 2.6 : 0) : 0;

        // winch
        const wn = fx.winch;
        if (W.state === 'lowering') {
          W.len = Math.min(45, W.len + 1.9 * dt); setWinchGeom(W.len); craft.updateMatrixWorld(true);
          wn.pod[1].getWorldPosition(v1); const gy = groundAt(v1.x, v1.z, v1.y + 0.4);
          if (v1.y - 0.01 <= gy) {
            world.drop.position.set(v1.x, gy, v1.z); world.drop.rotation.y = S.yaw; world.drop.visible = true; wn.pod.forEach((p) => { p.visible = false; });
            W.state = 'retract'; audio.beep(660, 0, 0.12, 0.1);
            const d = Math.hypot(v1.x - world.hiker.position.x, v1.z - world.hiker.position.z);
            if (d < 8) { M.stage = 2; M.done = true; M.tEnd = S.t; world.ring.visible = true; toast('Supplies delivered'); audio.beep(880, 0.14, 0.2, 0.1); }
            else toast('Pod down ' + Math.round(d) + ' m from the hiker. Reload at the pad');
          }
          if (!flying) W.state = 'raising';
        } else if (W.state === 'raising' || W.state === 'retract') {
          W.len = Math.max(0, W.len - 3 * dt); setWinchGeom(W.len);
          if (W.len <= 0) W.state = W.state === 'retract' ? 'empty' : 'stowed';
        } else if (W.state === 'empty' && S.mode === 'landed' && Math.hypot(S.pos.x, S.pos.z) < 4) {
          W.state = 'stowed'; wn.pod.forEach((p) => { p.visible = true; }); world.drop.visible = false; toast('Supply pod reloaded');
        }
        // keep the line plumb while the aircraft tilts
        wn.hang.quaternion.copy(tilt.quaternion).invert();

        // find the hiker: close pass, or centred in the onboard camera
        if (M.stage === 0) {
          const hx = world.hiker.position.x - S.pos.x, hz = world.hiker.position.z - S.pos.z, hd = Math.hypot(hx, hz); let found = hd < 13;
          if (!found && cam === 'nose' && hd < 90) { camera.getWorldDirection(v2); v3.set(world.hiker.position.x, 0.5, world.hiker.position.z).sub(camera.position).normalize(); found = v2.dot(v3) > Math.cos(Math.max(0.06, camera.fov * Math.PI / 180 * 0.3)) && (F.thermal || F.spot || hd < 35); }
          if (found) { M.stage = 1; world.ring.visible = true; toast('Hiker located'); audio.beep(784, 0, 0.1, 0.1); audio.beep(1047, 0.12, 0.16, 0.1); }
        }
        world.hikerMat.emissiveIntensity = F.thermal && cam === 'nose' ? 3 : 0;
        world.ring.material.opacity = 0.55 + 0.3 * Math.sin(S.t * 4);
      } else {
        // spray: droplets fly from the nozzle and clean the panel where they land
        const P = world.sprayPos, Vl = world.sprayVel, Lf = world.sprayLife;
        if (F.spray) {
          fx.nozzle.getWorldPosition(v1); v2.set(1, 0, 0).transformDirection(fx.nozzle.matrixWorld);
          let n = Math.round(420 * dt); if (n < 1) n = 1;
          for (let k = 0; k < n; k++) {
            const i = world.sprayI = (world.sprayI + 1) % world.sprayN, j = i * 3, sp = 15 + Math.random() * 2, back = Math.random() * dt;
            Vl[j] = v2.x * sp + S.vel.x + (Math.random() - 0.5) * 1.1; Vl[j + 1] = v2.y * sp + S.vel.y + (Math.random() - 0.5) * 1.1; Vl[j + 2] = v2.z * sp + S.vel.z + (Math.random() - 0.5) * 1.1;
            P[j] = v1.x + Vl[j] * back; P[j + 1] = v1.y + Vl[j + 1] * back; P[j + 2] = v1.z + Vl[j + 2] * back; Lf[i] = 1.1;
          }
        }
        for (let i = 0; i < world.sprayN; i++) {
          if (Lf[i] <= 0) continue; const j = i * 3, x0 = P[j];
          Vl[j + 1] -= G * dt; P[j] += Vl[j] * dt; P[j + 1] += Vl[j + 1] * dt; P[j + 2] += Vl[j + 2] * dt; Lf[i] -= dt;
          let dead = Lf[i] <= 0 || P[j + 1] < 0.02;
          if (!dead && x0 < PANEL.x && P[j] >= PANEL.x && P[j + 2] > PANEL.z0 && P[j + 2] < PANEL.z1 && P[j + 1] > PANEL.y0 && P[j + 1] < PANEL.y1) { if (!M.done) cleanAt(P[j + 1], P[j + 2]); dead = true; }
          if (!dead && insideBuilding(P[j], P[j + 1], P[j + 2], 0)) dead = true;
          if (dead) { Lf[i] = 0; P[j + 1] = -999; }
        }
        world.spray.geometry.attributes.position.needsUpdate = true;
        if (world.grimeDirty) { world.grimeTex.needsUpdate = true; world.grimeDirty = false; }
        if (!M.done && M.pct >= 0.9) { M.done = true; M.tEnd = S.t; toast('Wall clean'); audio.beep(784, 0, 0.1, 0.1); audio.beep(1047, 0.12, 0.16, 0.1); }

        // hose from the pump cart
        hoseT += dt;
        if (hoseT > 0.03) {
          hoseT = 0; tilt.localToWorld(v1.set(-0.02, -0.12, 0)); v2.set(PUMP.x, 0.62, PUMP.z);
          const d = v1.distanceTo(v2), slack = Math.max(0, HOSE - d), sag = Math.sqrt(0.375 * d * slack), pts = [];
          for (let i = 0; i <= 14; i++) { const t = i / 14, p = new V3().lerpVectors(v1, v2, t); p.y = Math.max(0.03, p.y - sag * 4 * t * (1 - t)); pts.push(p); }
          world.hose.geometry.dispose(); world.hose.geometry = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 44, 0.024, 6, false);
        }
      }
    }
    let hoseT = 1;

    function setFov(f) { if (Math.abs(f - fovNow) > 0.02) { fovNow = f; camera.fov = f; camera.updateProjectionMatrix(); } }
    function updateCamera(dt) {
      const fxx = Math.cos(S.yaw), fzz = -Math.sin(S.yaw), snap = camSnap; camSnap = false;
      if (cam === 'chase') {
        const far = S.mode === 'chute' || chute.collapse > 0, tall = Math.max(0, 1 - camera.aspect);   // portrait screens see a narrow slice, so stand further back
        let dist = rig.chaseDist * (far ? 1.9 : 1) * S.zoomK * (1 + tall * 0.9); const ch = (rig.chaseH + (far ? 1.6 : 0)) * (0.6 + 0.4 * S.zoomK) * (1 + tall * 0.5);
        for (let i = 0; i < 6; i++) { v1.set(S.pos.x - fxx * dist, S.pos.y + rig.cg + ch, S.pos.z - fzz * dist); if (!insideBuilding(v1.x, v1.y, v1.z, 0.4)) break; dist *= 0.72; }
        const gy = groundAt(v1.x, v1.z, v1.y) + 0.35; if (v1.y < gy) v1.y = gy;
        v2.set(S.pos.x + fxx * 1.3, S.pos.y + rig.cg + (far ? 1.5 : 0.1) - tall * 1.9 * (0.5 + 0.5 * S.zoomK), S.pos.z + fzz * 1.3);
        if (snap) { camera.position.copy(v1); camT.copy(v2); } else { camera.position.lerp(v1, 1 - Math.exp(-dt * 4.5)); camT.lerp(v2, 1 - Math.exp(-dt * 11)); }
        camera.up.set(0, 1, 0); camera.lookAt(camT); setFov(50 + tall * 20 + Math.min(9, Math.hypot(S.vel.x, S.vel.z) * 0.55));
      } else if (cam === 'nose') {
        fx.eye.getWorldPosition(v1);
        if (fx.eyeFixed) { fx.eye.getWorldQuaternion(qa); qb.setFromAxisAngle(Y_AXIS, -Math.PI / 2); camera.position.copy(v1); camera.quaternion.copy(qa).multiply(qb); setFov(72); }
        else { const cp = Math.cos(S.gimbal); v2.set(cp * fxx, Math.sin(S.gimbal), cp * fzz); camera.position.copy(v1).addScaledVector(v2, 0.05); camera.up.set(0, 1, 0); camera.lookAt(v3.copy(v1).addScaledVector(v2, 20)); setFov(2 * Math.atan(Math.tan(Math.PI / 6) / ZOOMS[zoomIdx]) * 180 / Math.PI); }
      } else {
        v1.subVectors(S.pos, S.lastPos); camera.position.add(v1); controls.target.set(S.pos.x, S.pos.y + rig.cg, S.pos.z); controls.update(); setFov(45);
      }
      S.lastPos.copy(S.pos);
      const therm = F.thermal && cam === 'nose';
      if (therm !== saved.therm) {
        // thermal: everything has some warmth, so lift the whole scene to grey and let the hot things burn white
        saved.therm = therm; renderer.domElement.style.filter = therm ? 'grayscale(1) contrast(1.25) brightness(1.2)' : '';
        renderer.toneMappingExposure = therm ? saved.exp * 2.6 : saved.exp; if (o.hemi) o.hemi.intensity = therm ? 1.5 : 0.2;
      }
      world.sky.position.copy(camera.position); world.stars.position.copy(camera.position);
    }

    let hudT = 0, mapT = 0;
    const fmtT = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
    function updateHud(dt) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('show'); }
      hudT += dt; if (hudT < 0.1) return; hudT = 0;
      const a = alt(), sp = S.vel.length(), hd = ((-S.yaw * 180 / Math.PI) % 360 + 360) % 360, home = Math.hypot(S.pos.x, S.pos.z);
      el.alt.textContent = a.toFixed(1); el.spd.textContent = sp.toFixed(1); el.hdg.textContent = ('00' + Math.round(hd) % 360).slice(-3); el.home.textContent = Math.round(home);
      let st = { landed: 'ON THE GROUND', spool: 'STARTING', takeoff: 'TAKING OFF', fly: 'FLYING', land: 'LANDING', rth: 'RETURNING HOME', chute: 'PARACHUTE' }[S.mode];
      if (el.status.textContent !== st) el.status.textContent = st;
      el.status.dataset.mode = S.mode;
      let extra = '';
      if (type === 'utility') {
        extra = 'HOSE ' + Math.round(S.hoseOut || 0) + ' / ' + HOSE + ' M';
        let wd = 99; BUILDINGS.forEach((b) => { if (S.pos.y < b.h) { const dx = Math.max(0, Math.abs(S.pos.x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(S.pos.z - b.z) - b.d / 2); wd = Math.min(wd, Math.hypot(dx, dz)); } });
        if (wd < 6) extra += ' · GAP ' + wd.toFixed(1) + ' M';
      } else if (W.len > 0.05) extra = 'LINE ' + W.len.toFixed(1) + ' M';
      if (el.extra.textContent !== extra) el.extra.textContent = extra;
      let ob;
      if (type === 'utility') ob = M.done ? 'Wall clean in ' + fmtT(M.tEnd - M.t0) + ' · head home' : 'Wash the marked wall · ' + Math.min(100, Math.round(M.pct / 0.9 * 100)) + '% clean';
      else ob = M.stage === 0 ? 'Find the missing hiker · try thermal' : M.stage === 1 ? 'Hiker found · lower the supply pod' : 'Delivered in ' + fmtT(M.tEnd - M.t0) + ' · head home';
      if (M.text !== ob) { M.text = ob; el.obj.textContent = ob; el.obj.classList.toggle('done', M.done); el.again.hidden = !M.done; }
      // arrows: straight up means dead ahead
      const fwx = Math.cos(S.yaw), fwz = -Math.sin(S.yaw), rtx = Math.sin(S.yaw), rtz = Math.cos(S.yaw);
      const bearing = (dx, dz) => Math.atan2(dx * rtx + dz * rtz, dx * fwx + dz * fwz) * 180 / Math.PI;
      el.homeA.style.transform = 'rotate(' + bearing(-S.pos.x, -S.pos.z).toFixed(0) + 'deg)'; el.homeA.style.visibility = home > 3 ? 'visible' : 'hidden';
      let tx = null, tz = 0, tn = '';
      if (type === 'utility') { if (!M.done) { tx = PANEL.x - 3; tz = 0; tn = 'WALL'; } }
      else if (M.stage === 1) { tx = world.hiker.position.x; tz = world.hiker.position.z; tn = 'HIKER'; }
      const td = tx === null ? 0 : Math.hypot(tx - S.pos.x, tz - S.pos.z), showT = tx !== null && td > 6;
      if (el.tgt.hidden === showT) el.tgt.hidden = !showT;
      if (showT) { el.tgtV.textContent = tn + ' ' + Math.round(td); el.tgtA.style.transform = 'rotate(' + bearing(tx - S.pos.x, tz - S.pos.z).toFixed(0) + 'deg)'; }
      const showRet = cam === 'nose' && !!fx.gimbalHead;
      if (el.ret.hidden === showRet) el.ret.hidden = !showRet;
      if (showRet) { const tg = 'ZOOM ' + ZOOMS[zoomIdx] + '×' + (F.thermal ? ' · THERMAL' : '') + ' · TILT ' + Math.round(S.gimbal * 180 / Math.PI) + '°'; if (el.retTag.textContent !== tg) el.retTag.textContent = tg; }
      syncButtons();
      mapT += 1; if (mapT % 2 === 0) drawMap();
    }
    function drawMap() {
      const c = el.map.getContext('2d'), Wd = el.map.width, R = Wd / 2, s = R / 85;
      const fxx = Math.cos(S.yaw), fzz = -Math.sin(S.yaw), rxx = Math.sin(S.yaw), rzz = Math.cos(S.yaw);
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, Wd, Wd);
      c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
      c.fillStyle = 'rgba(8,11,17,0.78)'; c.fillRect(0, 0, Wd, Wd);
      const a = s * rxx, cc = s * rzz, b = -s * fxx, d = -s * fzz;
      c.setTransform(a, b, cc, d, R - (a * S.pos.x + cc * S.pos.z), R - (b * S.pos.x + d * S.pos.z));
      c.lineWidth = 1.2 / s; c.strokeStyle = 'rgba(205,210,218,0.55)'; c.fillStyle = 'rgba(205,210,218,0.12)';
      BUILDINGS.forEach((bd) => { c.fillRect(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.w, bd.d); c.strokeRect(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.w, bd.d); });
      c.strokeStyle = 'rgba(226,190,114,0.9)'; c.lineWidth = 2 / s; c.beginPath(); c.arc(0, 0, 3.4, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(154,161,173,0.35)'; c.lineWidth = 1 / s; c.beginPath(); c.arc(0, 0, GEOFENCE, 0, Math.PI * 2); c.stroke();
      if (type === 'utility') {
        c.strokeStyle = 'rgba(91,237,226,0.9)'; c.lineWidth = 3 / s; c.beginPath(); c.moveTo(PANEL.x - 0.6, PANEL.z0); c.lineTo(PANEL.x - 0.6, PANEL.z1); c.stroke();
        c.strokeStyle = 'rgba(91,237,226,0.3)'; c.lineWidth = 1 / s; c.setLineDash([3 / s, 3 / s]); c.beginPath(); c.arc(PUMP.x, PUMP.z, HOSE, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      } else {
        if (M.stage >= 1) { c.fillStyle = '#5bede2'; c.beginPath(); c.arc(world.hiker.position.x, world.hiker.position.z, 3.2 / s * 1.2, 0, Math.PI * 2); c.fill(); }
        if (world.drop.visible) { c.fillStyle = '#e2be72'; c.fillRect(world.drop.position.x - 2 / s, world.drop.position.z - 2 / s, 4 / s, 4 / s); }
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      // home pointer when the pad is off the map
      const hx = (-S.pos.x * rxx - S.pos.z * rzz) * s, hy = -(-S.pos.x * fxx - S.pos.z * fzz) * s, hl = Math.hypot(hx, hy);
      if (hl > R - 12) { const k = (R - 12) / hl; c.fillStyle = '#e2be72'; c.beginPath(); c.arc(R + hx * k, R + hy * k, 5, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#f4f6f8'; c.beginPath(); c.moveTo(R, R - 11); c.lineTo(R + 7.5, R + 8); c.lineTo(R, R + 3.5); c.lineTo(R - 7.5, R + 8); c.closePath(); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(214,220,228,0.3)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
    }

    // ---------------------------------------------------------------- public
    function enter(m) {
      if (active) return; active = true;
      if (!world) world = buildWorld();
      saved.fov = camera.fov; saved.near = camera.near; saved.far = camera.far; saved.minD = controls.minDistance; saved.maxD = controls.maxDistance;
      saved.keyI = o.key.intensity; saved.rimI = o.rim.intensity; saved.hemiI = o.hemi ? o.hemi.intensity : 0; saved.shFar = o.key.shadow.camera.far; saved.therm = false;
      saved.touch = renderer.domElement.style.touchAction; renderer.domElement.style.touchAction = 'none'; saved.exp = renderer.toneMappingExposure;
      saved.hidden = (typeof o.viewerObjects === 'function' ? o.viewerObjects() : o.viewerObjects).filter(Boolean);
      camera.near = 0.1; camera.far = 2200; fovNow = 0; setFov(50);
      controls.minDistance = 2; controls.maxDistance = 45;
      o.key.intensity = 1.5; o.rim.intensity = 0.7; if (o.hemi) o.hemi.intensity = 0.2; o.key.shadow.camera.far = 90; o.key.shadow.camera.updateProjectionMatrix();
      scene.fog = new T.Fog(0x141b28, 70, 460);
      saved.hidden.forEach((x) => { x.visible = false; });
      world.group.visible = true; craft.visible = true;
      attach(m); audio.pause(false); audio.unlock(); audio.setOn(F.sound);
      saved.pr = renderer.getPixelRatio(); perf.t = 0; perf.n = 0;
      if (coarse && host.requestFullscreen && !document.fullscreenElement) { try { const r = host.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); saved.fs = true; } catch (e) {} }
      toast('Push the left stick up, or press TAKE OFF');
    }
    function exit() {
      if (!active) return; active = false;
      detach(); audio.update({ level: 0, speed: 0 }); audio.pause(true);
      world.group.visible = false; craft.visible = false; scene.fog = null;
      world.spotL.intensity = 0; world.barR.intensity = world.barB.intensity = 0;
      renderer.domElement.style.filter = ''; saved.therm = false; renderer.domElement.style.touchAction = saved.touch; renderer.toneMappingExposure = saved.exp;
      if (renderer.getPixelRatio() !== saved.pr) renderer.setPixelRatio(saved.pr);
      if (saved.fs && document.fullscreenElement && document.exitFullscreen) { try { const r = document.exitFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
      saved.fs = false; pts.clear();
      camera.near = saved.near; camera.far = saved.far; camera.fov = saved.fov; camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
      controls.enabled = true; controls.minDistance = saved.minD; controls.maxDistance = saved.maxD;
      o.key.intensity = saved.keyI; o.rim.intensity = saved.rimI; if (o.hemi) o.hemi.intensity = saved.hemiI; o.key.position.set(2.5, 4.5, 3); o.key.target.position.set(0, 0, 0); o.key.target.updateMatrixWorld();
      o.key.shadow.camera.far = saved.shFar; o.key.shadow.camera.updateProjectionMatrix();
      saved.hidden.forEach((x) => { x.visible = true; });
      for (const k in keys) keys[k] = false; touch.lx = touch.ly = touch.rx = touch.ry = 0;
    }
    const perf = { t: 0, n: 0 };
    function update(dt, real) {
      if (!active || !model) return;
      // if the device can't keep up, render fewer pixels rather than drop frames
      if (real) { perf.t += real; perf.n++; if (perf.n >= 90) { const avg = perf.t / perf.n, pr = renderer.getPixelRatio(); perf.t = 0; perf.n = 0; if (avg > 0.03 && pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.5)); if (o.onResize) o.onResize(); } } }
      S.t += dt;
      readInput(dt);
      simulate(dt);
      craft.position.copy(S.pos); craft.rotation.y = S.yaw;
      const wob = S.level > 0.35 && S.mode !== 'chute' ? 0.006 : 0;
      tilt.rotation.set(S.roll + wob * Math.sin(S.t * 5.1), 0, -S.pitch + wob * Math.sin(S.t * 4.3 + 1));
      craft.updateMatrixWorld(true);
      updatePayloads(dt);
      craft.updateMatrixWorld(true);
      o.key.position.set(S.pos.x + 1.6, S.pos.y + 10, S.pos.z + 2.2); o.key.target.position.copy(S.pos); o.key.target.updateMatrixWorld();
      updateCamera(dt);
      const bl = calm ? 0.8 : 0.5 + 0.5 * Math.sin(S.t * 2.2); world.beacons.forEach((b) => { b.material.color.setRGB(0.35 + 0.65 * bl, 0.08, 0.06); });
      const pk = Math.floor(S.t * 3) % 12; world.padLights.forEach((pl, i) => { const on = calm || S.mode === 'landed' || (i - pk + 12) % 12 < 3; pl.material.color.setHex(on ? 0x5bede2 : 0x12403c); });
      audio.update({ level: S.level, speed: S.vel.length(), engine: type === 'hybrid' && S.armed, siren: F.siren, spray: F.spray, winch: W.state === 'lowering' || W.state === 'raising' || W.state === 'retract' });
      updateHud(dt);
    }
    return {
      enter: enter, exit: exit, update: update, attach: attach, detach: detach,
      get active() { return active; },
      get state() { return { mode: S.mode, x: S.pos.x, y: S.pos.y, z: S.pos.z, yaw: S.yaw, level: S.level, cam: cam, winch: W.state, stage: M.stage, pct: M.pct, done: M.done, fn: Object.assign({}, F) }; },
      act: act,
      get internals() { return { S: S, F: F, W: W, M: M, world: world, input: touch, rig: rig, camera: camera, controls: controls }; }
    };
  }

  root.AeroFlight = { create: create };
})(window);
