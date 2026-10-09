/* AeroAssist portal: sign-in, two-factor, one-time links, and mounting the dashboard. */
(function () {
  var root = document.getElementById('root');

  /* ---------- helpers ---------- */
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function api(method, path, body, isForm) {
    var opt = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { 'x-aap': '1' } };
    if (body !== undefined) {
      if (isForm) opt.body = body;
      else { opt.body = JSON.stringify(body); opt.headers['content-type'] = 'application/json'; }
    }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('Something went wrong (' + r.status + ').')); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  window.AAPApi = api;

  function card(opts) {
    root.className = 'ip ip-auth';
    root.textContent = '';
    var main = el('main', 'ip-auth-card' + (opts.wide ? ' wide' : '')); main.id = 'ipMain';
    var brand = el('div', 'ip-brand'); brand.appendChild(el('span', 'ip-mark')); var bt = el('span');
    bt.appendChild(el('b', null, 'AeroAssist Industries')); bt.appendChild(el('i', null, 'Investor and team portal')); brand.appendChild(bt);
    main.appendChild(brand);
    main.appendChild(el('h1', null, opts.title));
    if (opts.lead) main.appendChild(el('p', 'ip-lead', opts.lead));
    var msg = el('p', 'ip-msg ip-hidden'); msg.setAttribute('role', 'status'); main.appendChild(msg);
    root.appendChild(main);
    main.say = function (t, err) { msg.textContent = t || ''; msg.className = 'ip-msg' + (err ? ' err' : '') + (t ? '' : ' ip-hidden'); };
    if (opts.notice) main.say(opts.notice, false);
    return main;
  }
  function footer(main) {
    var f = el('p', 'ip-fine ip-back'); var a = el('a', null, '← aeroassist.us'); a.href = 'https://aeroassist.us/'; f.appendChild(a); main.appendChild(f);
  }
  function field(form, label, type, name, attrs) {
    var l = el('label', null, label); l.htmlFor = 'f_' + name; form.appendChild(l);
    var i = el('input'); i.type = type; i.name = name; i.id = 'f_' + name;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    form.appendChild(i); return i;
  }
  function submitBtn(form, label) { var b = el('button', 'ip-btn pri', label); b.type = 'submit'; form.appendChild(b); return b; }
  function busy(b, on, label) { b.disabled = on; if (label) b.textContent = label; }

  /* ---------- screens ---------- */
  function signIn(notice) {
    var main = card({ title: 'Sign in', lead: 'Unit holders, prospective investors and the AeroAssist team sign in here for capital accounts, K-1s, company documents and reports.', notice: notice });
    var form = el('form', 'ip-form'); form.noValidate = false;
    var email = field(form, 'Email', 'email', 'email', { autocomplete: 'username', required: '', autocapitalize: 'off', spellcheck: 'false' });
    var pw = field(form, 'Password', 'password', 'password', { autocomplete: 'current-password', required: '' });
    var b = submitBtn(form, 'Continue');
    form.onsubmit = function (e) {
      e.preventDefault(); busy(b, true, 'Checking…'); main.say('');
      api('POST', '/api/login', { email: email.value, password: pw.value }).then(route).catch(function (err) { busy(b, false, 'Continue'); main.say(err.message, true); pw.value = ''; pw.focus(); });
    };
    main.appendChild(form);
    main.appendChild(el('p', 'ip-fine', 'After your password you’ll enter the 6-digit code from your authenticator app. Forgot your password or new here? Ask the CFO for a sign-in link.'));
    footer(main); email.focus();
  }
  function codeScreen() {
    var main = card({ title: 'Enter your code', lead: 'Open your authenticator app and type the 6-digit code for AeroAssist.' });
    var form = el('form', 'ip-form');
    var code = field(form, 'Code', 'text', 'code', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '9', required: '', class: 'ip-code', placeholder: '123456' });
    var b = submitBtn(form, 'Sign in');
    form.onsubmit = function (e) {
      e.preventDefault(); busy(b, true, 'Checking…');
      api('POST', '/api/code', { code: code.value }).then(route).catch(function (err) {
        busy(b, false, 'Sign in'); code.value = ''; code.focus();
        if (err.status === 429 || err.status === 401 && /sign in/i.test(err.message)) return signIn(err.message);
        main.say(err.message, true);
      });
    };
    main.appendChild(form);
    var alt = el('p', 'ip-fine'); var rc = el('button', 'ip-linkbtn', 'Use a recovery code instead'); rc.type = 'button';
    rc.onclick = function () { code.removeAttribute('inputmode'); code.setAttribute('maxlength', '12'); code.placeholder = 'XXXX-XXXX'; code.className = 'ip-code'; code.focus(); };
    alt.appendChild(rc); alt.appendChild(document.createTextNode(' · ')); var so = el('button', 'ip-linkbtn', 'Start again'); so.type = 'button'; so.onclick = signOut; alt.appendChild(so);
    main.appendChild(alt); footer(main); code.focus();
  }
  function enrollScreen() {
    var main = card({ title: 'Set up your authenticator', lead: 'Two-factor sign-in protects your documents. It takes about a minute.', wide: true });
    var steps = el('ol', 'ip-steps');
    ['Install an authenticator app on your phone if you don’t have one: Google Authenticator, Microsoft Authenticator, 1Password or Authy.',
     'In the app, add an account and scan this QR code (or type the key below).',
     'Enter the 6-digit code the app shows.'].forEach(function (t) { steps.appendChild(el('li', null, t)); });
    main.appendChild(steps);
    var qrBox = el('div', 'ip-qr'); qrBox.appendChild(el('p', 'ip-empty', 'Preparing…')); main.appendChild(qrBox);
    api('GET', '/api/enroll').then(function (r) {
      qrBox.textContent = '';
      try { var q = qrcode(0, 'M'); q.addData(r.uri); q.make(); var img = el('img'); img.src = q.createDataURL(5, 2); img.alt = 'QR code for your authenticator app'; qrBox.appendChild(img); } catch (e) {}
      var k = el('div'); k.appendChild(el('p', 'ip-fine', 'Can’t scan? Enter this key:')); var s = el('div', 'ip-secret', r.secret.replace(/(.{4})/g, '$1 ').trim()); k.appendChild(s); qrBox.appendChild(k);
    }).catch(function (err) { if (err.status === 401) return signIn(err.message); main.say(err.message, true); });
    var form = el('form', 'ip-form');
    var code = field(form, 'Code from the app', 'text', 'code', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', required: '', class: 'ip-code', placeholder: '123456' });
    var b = submitBtn(form, 'Turn on two-factor');
    form.onsubmit = function (e) {
      e.preventDefault(); busy(b, true, 'Checking…');
      api('POST', '/api/enroll', { code: code.value }).then(function (r) { showRecovery(r.recovery, function () { route({ stage: 'ok' }); }); })
        .catch(function (err) { busy(b, false, 'Turn on two-factor'); code.value = ''; if (err.status === 401 && /sign in/i.test(err.message) || err.status === 429) return signIn(err.message); main.say(err.message, true); code.focus(); });
    };
    main.appendChild(form); footer(main);
  }
  function showRecovery(codes, done) {
    var main = card({ title: 'Save your recovery codes', lead: 'If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe, like a password manager. They won’t be shown again.' });
    var box = el('div', 'ip-codes'); codes.forEach(function (c) { box.appendChild(el('span', null, c)); }); main.appendChild(box);
    var row = el('div', 'ip-row-btns');
    var dl = el('button', 'ip-btn', 'Download as a text file'); dl.type = 'button';
    dl.onclick = function () { var a = el('a'); a.href = URL.createObjectURL(new Blob(['AeroAssist portal recovery codes\n\n' + codes.join('\n') + '\n\nEach code works once.\n'], { type: 'text/plain' })); a.download = 'AeroAssist-recovery-codes.txt'; document.body.appendChild(a); a.click(); a.remove(); };
    var go = el('button', 'ip-btn pri', 'I’ve saved them, continue'); go.type = 'button'; go.onclick = done;
    row.appendChild(dl); row.appendChild(go); main.appendChild(row);
  }
  function linkScreen(token) {
    var main = card({ title: 'Choose your password', lead: 'Checking your link…' });
    api('POST', '/api/link/check', { token: token }).then(function (r) {
      main.querySelector('.ip-lead').textContent = 'Welcome' + (r.name ? ', ' + r.name.split(' ')[0] : '') + '. Choose a password for ' + r.email + '. Use at least 12 characters; a short sentence works well.';
      var form = el('form', 'ip-form');
      var hidden = el('input'); hidden.type = 'email'; hidden.value = r.email; hidden.autocomplete = 'username'; hidden.className = 'ip-hidden'; hidden.readOnly = true; form.appendChild(hidden);
      var p1 = field(form, 'New password', 'password', 'password', { autocomplete: 'new-password', required: '', minlength: '12' });
      var p2 = field(form, 'Type it again', 'password', 'password2', { autocomplete: 'new-password', required: '' });
      var b = submitBtn(form, 'Save password');
      form.onsubmit = function (e) {
        e.preventDefault();
        if (p1.value !== p2.value) return main.say('The two passwords don’t match.', true);
        busy(b, true, 'Saving…');
        api('POST', '/api/link/use', { token: token, password: p1.value }).then(route).catch(function (err) { busy(b, false, 'Save password'); main.say(err.message, true); });
      };
      main.appendChild(form); p1.focus();
    }).catch(function (err) { main.querySelector('.ip-lead').textContent = ''; main.say(err.message, true); var p = el('p'); var a = el('a', 'ip-btn', 'Go to sign in'); a.href = '/'; p.appendChild(a); main.appendChild(p); });
    footer(main);
  }
  function firstRun() {
    var main = card({ title: 'Set up the portal', lead: 'Create the first administrator. You need the setup code that was saved in Cloudflare as BOOTSTRAP_CODE.' });
    var form = el('form', 'ip-form');
    var code = field(form, 'Setup code', 'password', 'code', { required: '', autocomplete: 'off' });
    var name = field(form, 'Your name', 'text', 'name', { required: '' });
    var email = field(form, 'Your email (your portal sign-in)', 'email', 'email', { required: '' });
    var b = submitBtn(form, 'Create administrator');
    form.onsubmit = function (e) {
      e.preventDefault(); busy(b, true, 'Creating…');
      api('POST', '/api/bootstrap', { code: code.value, name: name.value, email: email.value }).then(function (r) { var t = /#setup=([A-Za-z0-9_-]+)/.exec(r.link); history.replaceState(null, '', '/'); linkScreen(t[1]); })
        .catch(function (err) { busy(b, false, 'Create administrator'); main.say(err.message, true); });
    };
    main.appendChild(form); footer(main);
  }
  function noAccess(me) {
    var main = card({ title: 'No portal access yet', lead: 'You’re signed in as ' + me.email + ', but an administrator hasn’t given this account access yet. Please contact ' + (me.helpEmail || 'the CFO') + '.' });
    var p = el('p'); var b = el('button', 'ip-btn', 'Sign out'); b.type = 'button'; b.onclick = signOut; p.appendChild(b); main.appendChild(p); footer(main);
  }

  /* ---------- the dashboard ---------- */
  function mount(data) {
    root.className = 'ip'; root.id = 'root';
    root.innerHTML = '<a class="ip-skip" href="#ipMain">Skip to content</a><div id="ptApp"><header class="ip-top"><div class="ip-brand"><span class="ip-mark" aria-hidden="true"></span><span><b>AeroAssist Industries</b><i>Investor portal</i></span></div><div class="ip-user"><span class="ip-asof" id="dbAsOf"></span><span class="ip-av" id="dbAv" aria-hidden="true">A</span><span class="ip-who"><b id="dbName">Welcome</b><i id="dbRole">Portal</i></span><button class="ip-out" id="ptOut" type="button">Sign out</button></div></header><div class="ip-body"><nav class="ip-nav" id="dbNav" aria-label="Portal sections"></nav><main class="ip-main" id="ipMain"><div class="ip-head"><div><p class="ip-k" id="dbKicker"></p><h1 id="dbTitle">Overview</h1></div><div class="ip-actions" id="dbActions"></div></div><p class="ip-note" id="dbNote" hidden></p><div id="dbView" class="ip-view"></div><footer class="ip-foot"><p>Figures are company records and unaudited; your subscription and operating agreements control. Indicative values use the current round price per unit and are not an appraisal, a tax valuation, or an offer to buy or sell units.</p><p id="dbAddr"></p></footer></main></div></div>';
    document.getElementById('dbAddr').textContent = data.address || '';
    document.getElementById('ptOut').onclick = signOut;
    var O = {
      onSignOut: signOut,
      onIdle: function () { api('POST', '/api/logout').catch(function () {}).then(function () { location.replace('/?signed_out=idle'); }); },
      ping: function () { api('POST', '/api/ping').catch(function (e) { if (e.status === 401 || e.status === 403) location.replace('/?signed_out=idle'); }); },
      seen: function (what) { api('POST', '/api/seen', { what: what }).catch(function () {}); },
    };
    O.views = { security: securityView(O) };
    if (data.role === 'admin' && window.AAPAdmin) Object.assign(O.views, window.AAPAdmin(O, api));
    if (data.raise && window.AAPRaise) Object.assign(O.views, window.AAPRaise(O, api));
    window.AAPortal.start(data, O);
  }
  function securityView(O) {
    return {
      title: ['Password and two-factor', 'Your account'],
      render: function (box, act, m) {
        var c1 = el('section', 'ip-card'); c1.appendChild(el('h2', null, 'Change your password'));
        var f = el('form'); var g = el('div', 'ip-fg');
        function inp(label, name, ac) { var l = el('label', 'ip-f'); l.appendChild(el('span', null, label)); var i = el('input'); i.type = 'password'; i.name = name; i.autocomplete = ac; i.required = true; l.appendChild(i); g.appendChild(l); return i; }
        var cur = inp('Current password', 'current', 'current-password'), n1 = inp('New password (12+ characters)', 'new', 'new-password'), n2 = inp('Type it again', 'new2', 'new-password');
        f.appendChild(g); var bar = el('div', 'ip-formbar'); var b = el('button', 'ip-btn pri', 'Change password'); b.type = 'submit'; bar.appendChild(b); var out = el('span'); bar.appendChild(out); f.appendChild(bar);
        f.onsubmit = function (e) {
          e.preventDefault(); out.className = ''; out.textContent = '';
          if (n1.value !== n2.value) { out.className = 'ip-banner err'; out.textContent = 'The two new passwords don’t match.'; return; }
          b.disabled = true;
          api('POST', '/api/password', { current: cur.value, password: n1.value }).then(function () { out.className = 'ip-banner ok'; out.textContent = 'Password changed. Other devices were signed out.'; f.reset(); })
            .catch(function (err) { out.className = 'ip-banner err'; out.textContent = err.message; }).then(function () { b.disabled = false; });
        };
        c1.appendChild(f); box.appendChild(c1);
        var c2 = el('section', 'ip-card'); c2.appendChild(el('h2', null, 'Two-factor'));
        c2.appendChild(el('p', null, 'You sign in with a code from your authenticator app. ' + (m.recoveryLeft != null ? 'You have ' + m.recoveryLeft + ' unused recovery codes.' : '')));
        c2.lastChild.style.marginTop = '0';
        var f2 = el('form'); var g2 = el('div', 'ip-fg'); var l2 = el('label', 'ip-f'); l2.appendChild(el('span', null, 'Code from your app')); var code = el('input'); code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.required = true; code.maxLength = 7; l2.appendChild(code); g2.appendChild(l2); f2.appendChild(g2);
        var bar2 = el('div', 'ip-formbar'); var b2 = el('button', 'ip-btn', 'Make new recovery codes'); b2.type = 'submit'; bar2.appendChild(b2); f2.appendChild(bar2);
        var out2 = el('div'); f2.appendChild(out2);
        f2.onsubmit = function (e) {
          e.preventDefault(); b2.disabled = true; out2.textContent = '';
          api('POST', '/api/recovery', { code: code.value }).then(function (r) {
            var box2 = el('div', 'ip-codes'); r.recovery.forEach(function (x) { box2.appendChild(el('span', null, x)); });
            out2.appendChild(el('p', 'ip-banner info', 'Your old recovery codes no longer work. Save these new ones now; they won’t be shown again.')); out2.appendChild(box2); m.recoveryLeft = 10; code.value = '';
          }).catch(function (err) { out2.appendChild(el('p', 'ip-banner err', err.message)); }).then(function () { b2.disabled = false; });
        };
        c2.appendChild(f2);
        c2.appendChild(el('p', 'ip-empty', 'New phone? Ask the CFO to reset your two-factor; they’ll send you a one-time link to set up the app again.'));
        box.appendChild(c2);
      },
    };
  }
  function signOut() {
    api('POST', '/api/logout').catch(function () {}).then(function () { location.replace('/?signed_out=1'); });
  }

  /* ---------- routing ---------- */
  function route(r) {
    var stage = r && r.stage;
    if (stage === 'code') return codeScreen();
    if (stage === 'enroll') return enrollScreen();
    if (stage === 'ok') {
      return api('GET', '/api/me').then(function (me) {
        if (me.stage !== 'ok') return route(me);
        if (!me.role) return noAccess(me);
        return api('GET', '/api/portal').then(mount);
      }).catch(function (err) { signIn(err.message); });
    }
    var q = new URLSearchParams(location.search);
    signIn(q.get('signed_out') === 'idle' ? 'You were signed out after a period without activity.' : q.get('signed_out') ? 'You’re signed out.' : '');
  }
  function start() {
    var h = location.hash || '';
    var m = /^#setup=([A-Za-z0-9_-]{20,})$/.exec(h);
    if (m) { history.replaceState(null, '', '/'); return linkScreen(m[1]); }
    if (h === '#first-run') {
      return api('GET', '/api/bootstrap').then(function (b) { if (b.needed) firstRun(); else route({}); });
    }
    api('GET', '/api/me').then(route).catch(function () { signIn('The portal could not be reached. Check your connection and reload.'); });
  }
  // A sign-up link pasted into a tab that already has the portal open.
  window.addEventListener('hashchange', function () { if (/^#(setup=|first-run$)/.test(location.hash)) start(); });
  start();
})();
