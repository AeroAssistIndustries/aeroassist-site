/* AeroAssist portal: administrator screens (People, one person, Manage documents, Transactions,
   Activity log, Settings, Import). Every action goes through /api/admin/*, which checks the role again. */
(function () {
  var ROLES = { prospect: 'Prospective investor', investor: 'Unit holder', employee: 'AeroAssist team', admin: 'Administrator' };
  var GROUPS = { company: 'Company (everyone)', investors: 'Investors and prospects', holders: 'Unit holders only', team: 'Team only', admin: 'Administrators only' };
  var PCATS = { tax: 'Tax (K-1)', certificates: 'Certificate', agreements: 'Agreement', updates: 'Investor update', team: 'Employment', other: 'Other' };
  var TXTYPES = ['Purchase', 'Subscription', 'Transfer in', 'Transfer out', 'Gift', 'Distribution', 'Return of capital', 'Repurchase', 'Adjustment'];
  var LOGS = { view: 'Viewed', download: 'Downloaded', zip: 'Downloaded (zip)', signin: 'Signed in', signin_failed: 'Failed sign-in', signout: 'Signed out', timeout: 'Timed out', denied: 'Refused', error: 'Error', upload: 'Uploaded', replace: 'Replaced file', delete: 'Deleted', doc_edit: 'Edited document', person_add: 'Added person', person_edit: 'Edited person', role_change: 'Changed role', access_removed: 'Removed access', twofa_reset: 'Reset two-factor', twofa_setup: 'Set up two-factor', link_issued: 'Issued sign-in link', password_set: 'Set password', password_change: 'Changed password', recovery_codes: 'New recovery codes', signed_out: 'Signed someone out', transaction: 'Recorded transaction', transaction_delete: 'Deleted transaction', settings: 'Changed settings' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function card(title, small) { var c = el('section', 'ip-card'), h = el('h2', null, title); if (small) h.appendChild(el('small', null, small)); c.appendChild(h); return c; }
  function btn(label, cls, fn) { var b = el('button', 'ip-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (fn) b.onclick = function () { fn(b); }; return b; }
  function fmtDate(d) { if (!d) return ''; var p = String(d).split('-'); return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0] : d; }
  function fmtTime(s) { return s ? new Date(s * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US'); }
  function num(n) { return (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function banner(box, text, kind) { var b = el('p', 'ip-banner ' + (kind || 'ok'), text); box.insertBefore(b, box.firstChild); setTimeout(function () { if (b.parentNode && kind !== 'err') b.remove(); }, 9000); return b; }
  function pill(text, kind) { return el('span', 'ip-pill' + (kind ? ' ' + kind : ''), text); }
  function table(cols, rows) {
    var w = el('div', 'ip-tw'), t = el('table', 'ip-table'), th = el('thead'), tr = el('tr');
    cols.forEach(function (c) { tr.appendChild(el('th', c.n ? 'n' : (c.act ? 'act' : null), c.h)); }); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) { var row = el('tr', r.cls || null); r.cells.forEach(function (v, i) { var td = el('td', cols[i].n ? 'n' : (cols[i].act ? 'act' : null)); if (v instanceof Node) td.appendChild(v); else td.textContent = v == null ? '' : v; row.appendChild(td); }); tb.appendChild(row); });
    if (!rows.length) { var e = el('tr'), td = el('td', null, 'Nothing here yet.'); td.colSpan = cols.length; td.className = 'ip-empty'; e.appendChild(td); tb.appendChild(e); }
    t.appendChild(tb); w.appendChild(t); return w;
  }
  /** A labelled form field. type: text, email, number, date, select, textarea, checkbox, file. */
  function f(form, label, name, type, opts) {
    opts = opts || {};
    if (type === 'checkbox') {
      var lc = el('label', 'ip-check' + (opts.full ? ' full' : '')), c = el('input'); c.type = 'checkbox'; c.name = name; c.checked = !!opts.value; lc.appendChild(c); lc.appendChild(el('span', null, label)); form.appendChild(lc); return c;
    }
    var l = el('label', 'ip-f' + (opts.full ? ' full' : '')); l.appendChild(el('span', null, label));
    var i;
    if (type === 'select') {
      i = el('select'); (opts.options || []).forEach(function (o) { var op = new Option(o[1], o[0]); i.appendChild(op); });
    } else if (type === 'textarea') {
      i = el('textarea'); i.rows = opts.rows || 4;
    } else { i = el('input'); i.type = type || 'text'; if (type === 'number') i.step = 'any'; }
    i.name = name;
    if (opts.value != null) i.value = opts.value;
    if (opts.required) i.required = true;
    if (opts.placeholder) i.placeholder = opts.placeholder;
    l.appendChild(i);
    if (opts.hint) l.appendChild(el('small', null, opts.hint));
    form.appendChild(l); return i;
  }
  function grid(parent) { var g = el('div', 'ip-fg'); parent.appendChild(g); return g; }
  function formbar(form, label, cls) { var bar = el('div', 'ip-formbar'), b = el('button', 'ip-btn ' + (cls || 'pri'), label); b.type = 'submit'; bar.appendChild(b); form.appendChild(bar); return b; }
  function lines(rows) { return (rows || []).map(function (r) { return r.join(' | '); }).join('\n'); }
  function unlines(text, cols) { return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { var p = l.split('|').map(function (x) { return x.trim(); }); while (p.length < cols) p.push(''); if (p.length > cols) p = p.slice(0, cols - 1).concat([p.slice(cols - 1).join(' | ')]); return p; }); }
  function linkBox(parent, link, name) {
    var w = el('div', 'ip-banner info');
    w.appendChild(el('div', null, 'Send this one-time sign-in link to ' + name + ' by text or email. It works once and expires ' + fmtTime(link.expires_at) + '. They choose their own password and set up their authenticator app.'));
    var row = el('div', 'ip-linkbox'), i = el('input'); i.readOnly = true; i.value = link.url; i.setAttribute('aria-label', 'Sign-in link');
    row.appendChild(i);
    row.appendChild(btn('Copy link', 'pri', function (b) { i.select(); (navigator.clipboard ? navigator.clipboard.writeText(link.url) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { document.execCommand('copy'); b.textContent = 'Copied'; }); }));
    var mail = el('a', 'ip-btn', 'Open in email'); mail.href = 'mailto:?subject=' + encodeURIComponent('Your AeroAssist portal sign-in') + '&body=' + encodeURIComponent('Hello ' + String(name).split(' ')[0] + ',\n\nHere is your one-time link to set up your AeroAssist Industries portal sign-in:\n' + link.url + '\n\nYou will choose a password and set up an authenticator app (Google Authenticator, Microsoft Authenticator or similar). The link works once.\n'); row.appendChild(mail);
    w.appendChild(row); parent.insertBefore(w, parent.firstChild); return w;
  }
  function status(p) {
    if (!p.active) return ['Switched off', 'warn'];
    if (!p.role) return ['No access yet', 'warn'];
    if (!p.has_password) return [p.link_expires ? 'Invited' : 'Needs a sign-in link', p.link_expires ? '' : 'warn'];
    if (!p.twofa) return ['Needs authenticator', 'warn'];
    return ['Active', 'good'];
  }

  window.AAPAdmin = function (O, api) {
    var state = { person: null, people: null };
    function people() { return api('GET', '/api/admin/people').then(function (r) { state.people = r; return r; }); }
    function personOptions(list, blank) { return [['', blank || 'Choose a person…']].concat(list.map(function (p) { return [p.id, p.name + ' (' + p.portal_id + ')']; })); }
    O.openPerson = function (id) { state.person = id; O.go('person'); };
    function fail(box) { return function (err) { banner(box, err.message, 'err'); }; }

    /* ---------- People ---------- */
    function vPeople(box, act) {
      var add = card('Add a person'), form = el('form'), g = grid(form);
      var name = f(g, 'Full name', 'name', 'text', { required: true });
      var email = f(g, 'Email', 'email', 'email', { required: true });
      var role = f(g, 'Role', 'role', 'select', { options: Object.keys(ROLES).map(function (k) { return [k, ROLES[k]]; }), value: 'investor' });
      var units = f(g, 'Units', 'units', 'number');
      var inv = f(g, 'Paid-in ($)', 'invested', 'number');
      var since = f(g, 'Holder since', 'since', 'date');
      var title = f(g, 'Title (team, optional)', 'title', 'text');
      var b = formbar(form, 'Add person');
      form.onsubmit = function (e) {
        e.preventDefault(); b.disabled = true;
        api('POST', '/api/admin/people', { name: name.value, email: email.value, role: role.value, units: units.value, invested: inv.value, since: since.value, title: title.value })
          .then(function (r) { form.reset(); role.value = 'investor'; linkBox(add, r.link, r.person.name); list(); })
          .catch(function (err) { banner(add, err.message, 'err'); }).then(function () { b.disabled = false; });
      };
      add.appendChild(form); box.appendChild(add);
      var c = card('Everyone with a sign-in'), out = el('div'); out.appendChild(el('p', 'ip-empty', 'Loading…')); c.appendChild(out); box.appendChild(c);
      function list() {
        people().then(function (ps) {
          out.textContent = '';
          out.appendChild(table([{ h: 'Portal ID' }, { h: 'Name' }, { h: 'Email' }, { h: 'Role' }, { h: 'Status' }, { h: 'Last sign-in' }, { h: 'Units', n: 1 }, { h: 'Paid-in', n: 1 }],
            ps.map(function (p) { var s = status(p), n = el('button', 'ip-linkbtn nm', p.name); n.type = 'button'; n.onclick = function () { O.openPerson(p.id); };
              return { cells: [el('span', 'ip-mono', p.portal_id), n, p.email, p.role ? ROLES[p.role] : '—', pill(s[0], s[1]), p.last_signin ? fmtTime(p.last_signin) : 'Never', p.units ? num(p.units) : '—', p.invested ? money(p.invested) : '—'] }; })));
        }).catch(fail(box));
      }
      list();
    }

    /* ---------- One person ---------- */
    function vPerson(box, act) {
      if (!state.person) return O.go('people');
      act.appendChild(btn('← People', '', function () { O.go('people'); }));
      var holder = el('div'); box.appendChild(holder); holder.appendChild(el('p', 'ip-empty', 'Loading…'));
      Promise.all([people(), api('GET', '/api/admin/documents'), api('GET', '/api/admin/transactions'), api('GET', '/api/admin/activity?limit=25&user=' + encodeURIComponent(state.person))]).then(function (r) {
        var p = r[0].filter(function (x) { return x.id === state.person; })[0];
        if (!p) { holder.textContent = 'Not found.'; return; }
        holder.textContent = '';
        document.getElementById('dbTitle').textContent = p.name;
        document.getElementById('dbKicker').textContent = 'Portal ID ' + p.portal_id + (p.role ? ' · ' + ROLES[p.role] : '');
        var me = O.data && O.data.holder && O.data.holder.email === p.email;
        var grid2 = el('div', 'ip-grid ip-2'), L = el('div', 'ip-grid'), R = el('div', 'ip-grid'); grid2.appendChild(L); grid2.appendChild(R); holder.appendChild(grid2);

        var dc = card('Details'), form = el('form'), g = grid(form);
        var name = f(g, 'Full name', 'name', 'text', { value: p.name, required: true });
        var email = f(g, 'Email (their sign-in)', 'email', 'email', { value: p.email, required: true });
        var role = f(g, 'Role', 'role', 'select', { options: [['', 'No access']].concat(Object.keys(ROLES).map(function (k) { return [k, ROLES[k]]; })), value: p.role || '' });
        if (me) role.disabled = true;
        var units = f(g, 'Units', 'units', 'number', { value: p.units || '' });
        var inv = f(g, 'Paid-in ($)', 'invested', 'number', { value: p.invested || '' });
        var since = f(g, 'Holder since', 'since', 'date', { value: p.since || '' });
        var title = f(g, 'Title', 'title', 'text', { value: p.title || '' });
        var pid = f(g, 'Portal ID', 'portal_id', 'text', { value: p.portal_id });
        var b = formbar(form, 'Save details');
        form.onsubmit = function (e) {
          e.preventDefault(); b.disabled = true;
          var body = { name: name.value, email: email.value, units: units.value, invested: inv.value, since: since.value, title: title.value, portal_id: pid.value };
          if (!me) body.role = role.value || null;
          api('PATCH', '/api/admin/people/' + p.id, body).then(function () { banner(dc, 'Saved.'); }).catch(function (err) { banner(dc, err.message, 'err'); }).then(function () { b.disabled = false; });
        };
        dc.appendChild(form); L.appendChild(dc);

        var ac = card('Sign-in and access'), s = status(p), kv = el('dl', 'ip-kv');
        [['Status', pill(s[0], s[1])], ['Password', p.has_password ? 'Set' : 'Not set yet'], ['Authenticator', p.twofa ? 'Set up' : 'Not set up'], ['Recovery codes left', p.twofa ? String(p.recovery_left) : '—'], ['Last sign-in', p.last_signin ? fmtTime(p.last_signin) : 'Never'], ['Open sign-in link', p.link_expires ? 'Until ' + fmtTime(p.link_expires) : 'None']].forEach(function (x) { kv.appendChild(el('dt', null, x[0])); var dd = el('dd'); if (x[1] instanceof Node) dd.appendChild(x[1]); else dd.textContent = x[1]; kv.appendChild(dd); });
        ac.appendChild(kv);
        var acts = el('div', 'ip-row-btns');
        if (!me) {
          acts.appendChild(btn(p.has_password ? 'New sign-in link' : 'Make a sign-in link', 'pri', function (bt) { bt.disabled = true; api('POST', '/api/admin/people/' + p.id + '/link', { reset_password: false }).then(function (l) { linkBox(ac, l, p.name); }).catch(fail(ac)).then(function () { bt.disabled = false; }); }));
          if (p.has_password) acts.appendChild(btn('Forgot password: reset it', '', function (bt) { if (!confirm('Their current password stops working now, and they set a new one from the link. Continue?')) return; bt.disabled = true; api('POST', '/api/admin/people/' + p.id + '/link', { reset_password: true }).then(function (l) { linkBox(ac, l, p.name); }).catch(fail(ac)).then(function () { bt.disabled = false; }); }));
          if (p.twofa) acts.appendChild(btn('Reset two-factor (lost phone)', '', function (bt) { if (!confirm('Their authenticator stops working now. You’ll get a one-time link to send them; they set up the new phone from it. Continue?')) return; bt.disabled = true; api('POST', '/api/admin/people/' + p.id + '/reset-2fa', {}).then(function (l) { linkBox(ac, l, p.name); }).catch(fail(ac)).then(function () { bt.disabled = false; }); }));
          acts.appendChild(btn('Sign out everywhere', '', function () { api('POST', '/api/admin/people/' + p.id + '/signout', {}).then(function () { banner(ac, 'Signed out on every device.'); }).catch(fail(ac)); }));
          acts.appendChild(btn(p.active ? 'Switch off access' : 'Restore access', p.active ? 'danger' : '', function () {
            if (p.active && !confirm('Switch off ' + p.name + '? They are signed out at once. Their documents and history are kept.')) return;
            api('PATCH', '/api/admin/people/' + p.id, { active: !p.active }).then(function () { O.go('person'); }).catch(fail(ac));
          }));
        } else ac.appendChild(el('p', 'ip-empty', 'This is you. Change your password under Password and two-factor.'));
        ac.appendChild(acts); R.appendChild(ac);

        // Personal documents
        var pc = card('Personal documents', 'Only ' + p.name + ' and administrators can open these');
        pc.appendChild(uploadForm({ personal: true, user: p.id, done: function () { O.go('person'); } }));
        var mine = r[1].filter(function (d) { return d.grp === 'personal' && d.user_id === p.id; });
        pc.appendChild(docTable(mine, false, function () { O.go('person'); }));
        L.appendChild(pc);

        // Transactions
        var tc = card('Transactions');
        tc.appendChild(txForm(p.id, function () { O.go('person'); }));
        tc.appendChild(txTable(r[2].filter(function (t) { return t.user_id === p.id; }), false, function () { O.go('person'); }));
        L.appendChild(tc);

        var lc = card('Recent activity'); lc.appendChild(logTable(r[3], false, true)); R.appendChild(lc);
      }).catch(fail(box));
    }

    /* ---------- documents ---------- */
    function uploadForm(o) {
      var form = el('form'), g = grid(form), who, person, cat;
      if (o.personal) {
        cat = f(g, 'Type', 'category', 'select', { options: Object.keys(PCATS).map(function (k) { return [k, PCATS[k]]; }) });
      } else {
        who = f(g, 'Who can see it', 'grp', 'select', { options: Object.keys(GROUPS).map(function (k) { return [k, GROUPS[k]]; }).concat([['personal', 'One person (K-1, certificate…)']]), value: 'holders' });
        person = f(g, 'Person', 'user_id', 'select', { options: personOptions(state.people || []) });
        person.parentNode.classList.add('ip-hidden');
        cat = f(g, 'Category', 'category', 'text', { placeholder: 'Unit holder reports', hint: 'Groups documents for readers' });
        var pcat = f(g, 'Type', 'pcat', 'select', { options: Object.keys(PCATS).map(function (k) { return [k, PCATS[k]]; }) });
        pcat.parentNode.classList.add('ip-hidden');
        who.onchange = function () { var pers = who.value === 'personal'; person.parentNode.classList.toggle('ip-hidden', !pers); pcat.parentNode.classList.toggle('ip-hidden', !pers); cat.parentNode.classList.toggle('ip-hidden', pers); };
        if (!state.people) people().then(function (ps) { person.textContent = ''; personOptions(ps).forEach(function (x) { person.appendChild(new Option(x[1], x[0])); }); });
      }
      var title = f(g, 'Title', 'title', 'text', { required: true, placeholder: o.personal ? '2025 Schedule K-1' : '' });
      var dt = f(g, 'Date', 'doc_date', 'date', { value: today() });
      var desc = o.personal ? null : f(g, 'Short description (optional)', 'description', 'text', { full: true });
      var file = f(g, 'File (PDF, Office, CSV, text or image; up to 25 MB)', 'file', 'file', { required: true, full: true });
      var b = formbar(form, 'Upload');
      form.onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData();
        var grp = o.personal ? 'personal' : who.value;
        fd.append('grp', grp);
        if (grp === 'personal') { var uid = o.personal ? o.user : person.value; if (!uid) return banner(form, 'Choose the person.', 'err'); fd.append('user_id', uid); fd.append('category', o.personal ? cat.value : form.querySelector('[name=pcat]').value); }
        else fd.append('category', cat.value || 'Documents');
        fd.append('title', title.value); fd.append('doc_date', dt.value); fd.append('description', desc ? desc.value : '');
        if (!file.files[0]) return banner(form, 'Choose a file.', 'err');
        fd.append('file', file.files[0]);
        b.disabled = true; b.textContent = 'Encrypting and uploading…';
        api('POST', '/api/admin/documents', fd, true).then(function () { form.reset(); dt.value = today(); banner(form, 'Uploaded and encrypted.'); if (o.done) o.done(); })
          .catch(function (err) { banner(form, err.message, 'err'); }).then(function () { b.disabled = false; b.textContent = 'Upload'; });
      };
      return form;
    }
    function docTable(docs, showWho, done) {
      return table([{ h: 'Title' }].concat(showWho ? [{ h: 'Person' }] : []).concat([{ h: 'Type' }, { h: 'Date' }, { h: 'Size', n: 1 }, { h: 'Opened', n: 1 }, { h: '', act: 1 }]), docs.map(function (d) {
        var nm = el('span', 'nm', d.title); if (d.description) nm.appendChild(el('span', 'sub', d.description));
        var a = el('span');
        var open = el('a', 'ip-btn', 'Open'); open.href = '/api/file/' + d.id + (d.mime === 'application/pdf' ? '?mode=view' : ''); open.target = '_blank'; open.rel = 'noopener'; a.appendChild(open);
        a.appendChild(btn('Edit', '', function () { editDoc(d, done); }));
        a.appendChild(btn('Delete', 'danger', function () { if (!confirm('Delete “' + d.title + '” permanently?')) return; api('DELETE', '/api/admin/documents/' + d.id).then(done).catch(function (err) { alert(err.message); }); }));
        return { cells: [nm].concat(showWho ? [d.owner || '—'] : []).concat([d.grp === 'personal' ? (PCATS[d.category] || d.category) : d.category, fmtDate(d.doc_date), kb(d.size), String(d.opened), a]) };
      }));
    }
    function editDoc(d, done) {
      var view = document.getElementById('dbView'), c = card('Edit “' + d.title + '”'), form = el('form'), g = grid(form);
      var who = d.grp === 'personal' ? null : f(g, 'Who can see it', 'grp', 'select', { options: Object.keys(GROUPS).map(function (k) { return [k, GROUPS[k]]; }), value: d.grp });
      var cat = d.grp === 'personal' ? f(g, 'Type', 'category', 'select', { options: Object.keys(PCATS).map(function (k) { return [k, PCATS[k]]; }), value: d.category }) : f(g, 'Category', 'category', 'text', { value: d.category });
      var title = f(g, 'Title', 'title', 'text', { value: d.title, required: true });
      var dt = f(g, 'Date', 'doc_date', 'date', { value: d.doc_date });
      var desc = f(g, 'Description', 'description', 'text', { value: d.description, full: true });
      var file = f(g, 'Replace the file (optional) · now: ' + d.file_name, 'file', 'file', { full: true });
      var b = formbar(form, 'Save');
      var cancel = btn('Cancel', '', function () { c.remove(); }); b.parentNode.appendChild(cancel);
      form.onsubmit = function (e) {
        e.preventDefault(); var fd = new FormData();
        fd.append('grp', who ? who.value : 'personal'); if (d.user_id) fd.append('user_id', d.user_id);
        fd.append('category', cat.value); fd.append('title', title.value); fd.append('doc_date', dt.value); fd.append('description', desc.value);
        if (file.files[0]) fd.append('file', file.files[0]);
        b.disabled = true;
        api('PATCH', '/api/admin/documents/' + d.id, fd, true).then(done).catch(function (err) { banner(c, err.message, 'err'); b.disabled = false; });
      };
      c.appendChild(form); view.insertBefore(c, view.firstChild); window.scrollTo(0, 0); title.focus();
    }
    function vLibrary(box) {
      var up = card('Add a document'); up.appendChild(el('p', 'ip-empty', 'Files are encrypted before they are stored. People only see what their role allows, and every open is logged.')); up.lastChild.style.marginBottom = '12px';
      box.appendChild(up);
      var out = el('div', 'ip-grid'); box.appendChild(out); out.appendChild(el('p', 'ip-empty', 'Loading…'));
      function load() {
        Promise.all([people(), api('GET', '/api/admin/documents')]).then(function (r) {
          if (!up.querySelector('form')) up.appendChild(uploadForm({ done: load }));
          out.textContent = '';
          Object.keys(GROUPS).concat(['personal']).forEach(function (g) {
            var list = r[1].filter(function (d) { return d.grp === g; });
            var c = card(g === 'personal' ? 'Personal documents' : GROUPS[g], list.length + ' document' + (list.length === 1 ? '' : 's'));
            c.appendChild(docTable(list, g === 'personal', load)); out.appendChild(c);
          });
        }).catch(fail(box));
      }
      load();
    }

    /* ---------- transactions ---------- */
    function txForm(userId, done) {
      var form = el('form'), g = grid(form), who = null;
      if (!userId) { who = f(g, 'Person', 'user_id', 'select', { options: personOptions(state.people || []), required: true }); if (!state.people) people().then(function (ps) { who.textContent = ''; personOptions(ps).forEach(function (x) { who.appendChild(new Option(x[1], x[0])); }); }); }
      var dt = f(g, 'Date', 'tx_date', 'date', { value: today(), required: true });
      var type = f(g, 'Type', 'type', 'select', { options: TXTYPES.map(function (t) { return [t, t]; }) });
      var units = f(g, 'Units', 'units', 'number');
      var amount = f(g, 'Amount ($)', 'amount', 'number');
      var note = f(g, 'Note (shown to them)', 'note', 'text', { full: true });
      var adj = f(g, 'Also update their units and paid-in (adds for purchases, subscriptions, transfers in and gifts; subtracts units for transfers out and repurchases)', 'adjust', 'checkbox', { value: true, full: true });
      var b = formbar(form, 'Record transaction');
      form.onsubmit = function (e) {
        e.preventDefault(); var uid = userId || who.value; if (!uid) return banner(form, 'Choose a person.', 'err');
        b.disabled = true;
        api('POST', '/api/admin/transactions', { user_id: uid, tx_date: dt.value, type: type.value, units: units.value, amount: amount.value, note: note.value, adjust: adj.checked })
          .then(done).catch(function (err) { banner(form, err.message, 'err'); }).then(function () { b.disabled = false; });
      };
      return form;
    }
    function txTable(list, showWho, done) {
      return table((showWho ? [{ h: 'Person' }] : []).concat([{ h: 'Date' }, { h: 'Type' }, { h: 'Units', n: 1 }, { h: 'Amount', n: 1 }, { h: 'Note' }, { h: '', act: 1 }]), list.map(function (t) {
        return { cells: (showWho ? [t.name || '—'] : []).concat([fmtDate(t.tx_date), t.type, t.units ? num(t.units) : '—', t.amount ? money(t.amount) : '—', t.note, btn('Delete', 'danger', function () { if (!confirm('Delete this transaction? Units and paid-in are not changed.')) return; api('DELETE', '/api/admin/transactions/' + t.id).then(done).catch(function (err) { alert(err.message); }); })]) };
      }));
    }
    function vTxns(box) {
      var c = card('Record a transaction'); box.appendChild(c);
      var l = card('All transactions'), out = el('div'); l.appendChild(out); box.appendChild(l);
      function load() {
        Promise.all([people(), api('GET', '/api/admin/transactions')]).then(function (r) {
          if (!c.querySelector('form')) c.appendChild(txForm(null, load));
          out.textContent = ''; out.appendChild(txTable(r[1], true, load));
        }).catch(fail(box));
      }
      load();
    }

    /* ---------- activity log ---------- */
    function logTable(list, showWho, compact) {
      if (compact) return table([{ h: 'When' }, { h: 'Action' }, { h: 'Document' }], list.map(function (a) {
        var t = new Date(a.when * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return { cells: [t, LOGS[a.action] || a.action, a.doc || a.detail || ''] };
      }));
      return table([{ h: 'When' }].concat(showWho ? [{ h: 'Person' }] : []).concat([{ h: 'Action' }, { h: 'Document' }, { h: 'Detail' }, { h: 'IP address' }]), list.map(function (a) {
        return { cells: [fmtTime(a.when)].concat(showWho ? [a.who] : []).concat([LOGS[a.action] || a.action, a.doc || (a.doc_id ? '#' + a.doc_id : ''), a.detail, el('span', 'ip-mono', a.ip || '')]) };
      }));
    }
    function vLog(box, act) {
      var c = card('Activity'), form = el('form', 'ip-filters');
      var who = el('select'); who.appendChild(new Option('Everyone', '')); form.appendChild(who);
      var type = el('select'); [['', 'All activity'], ['files', 'Document views and downloads'], ['signin', 'Sign-ins and passwords'], ['denied', 'Refusals and failures'], ['admin', 'Changes by administrators']].forEach(function (o) { type.appendChild(new Option(o[1], o[0])); }); form.appendChild(type);
      var from = el('input'); from.type = 'date'; from.setAttribute('aria-label', 'From'); form.appendChild(from);
      var to = el('input'); to.type = 'date'; to.setAttribute('aria-label', 'To'); form.appendChild(to);
      var go = el('button', 'ip-btn', 'Filter'); go.type = 'submit'; form.appendChild(go);
      var exp = btn('Export CSV', '', function () { exportCsv(); }); form.appendChild(exp);
      c.appendChild(form); var out = el('div'); c.appendChild(out); box.appendChild(c);
      var rowsNow = [];
      people().then(function (ps) { ps.forEach(function (p) { who.appendChild(new Option(p.name, p.id)); }); });
      function load() {
        var q = '?limit=1000' + (who.value ? '&user=' + encodeURIComponent(who.value) : '') + (type.value ? '&type=' + type.value : '') + (from.value ? '&from=' + from.value : '') + (to.value ? '&to=' + to.value : '');
        api('GET', '/api/admin/activity' + q).then(function (r) { rowsNow = r; out.textContent = ''; out.appendChild(el('p', 'ip-empty', r.length + ' entries' + (r.length >= 1000 ? ' (newest 1,000)' : ''))); out.appendChild(logTable(r, true)); }).catch(fail(box));
      }
      function exportCsv() {
        var esc = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
        var csv = [['When (UTC)', 'Person', 'Portal ID', 'Action', 'Document', 'Detail', 'IP address', 'Browser']].concat(rowsNow.map(function (a) { return [new Date(a.when * 1000).toISOString().replace('T', ' ').slice(0, 19), a.who, a.portal_id, LOGS[a.action] || a.action, a.doc, a.detail, a.ip, a.ua]; }))
          .map(function (r) { return r.map(esc).join(','); }).join('\r\n');
        var a = el('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'aeroassist-portal-activity-' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      }
      form.onsubmit = function (e) { e.preventDefault(); load(); };
      load();
    }

    /* ---------- settings ---------- */
    function vSettings(box) {
      var holder = el('div', 'ip-grid'); box.appendChild(holder);
      api('GET', '/api/admin/settings').then(function (s) {
        var form = el('form', 'ip-grid');
        var c1 = card('Units and values'), g1 = grid(c1);
        var F = {};
        F.as_of = f(g1, 'Records as of', 'as_of', 'date', { value: s.as_of });
        F.units_outstanding = f(g1, 'Units outstanding', 'units_outstanding', 'number', { value: s.units_outstanding });
        F.unit_price = f(g1, 'Price per unit ($)', 'unit_price', 'number', { value: s.unit_price });
        F.round_units = f(g1, 'Units offered in the current round', 'round_units', 'number', { value: s.round_units, hint: 'For “ownership after the round”; 0 hides it' });
        F.round_name = f(g1, 'Round name', 'round_name', 'text', { value: s.round_name });
        F.price_label = f(g1, 'Price note (under the capital account)', 'price_label', 'text', { value: s.price_label, full: true });
        F.price_history = f(g1, 'Price history (one per line: date | price | label)', 'price_history', 'textarea', { value: (s.price_history || []).map(function (p) { return [p.date, p.price, p.label].join(' | '); }).join('\n'), full: true });
        var c2 = card('What people see'), g2 = grid(c2);
        F.note = f(g2, 'Note at the top of every page (optional)', 'note', 'text', { value: s.note, full: true });
        F.announcements = f(g2, 'Announcements (one per line: date | title | text)', 'announcements', 'textarea', { value: (s.announcements || []).map(function (a) { return [a.date, a.title, a.body].join(' | '); }).join('\n'), full: true, rows: 5 });
        F.tax_note = f(g2, 'Tax note for unit holders (K-1 timing)', 'tax_note', 'text', { value: s.tax_note, full: true });
        F.company_facts = f(g2, 'Company at a glance (one per line: label | value)', 'company_facts', 'textarea', { value: lines(s.company_facts), full: true, rows: 6 });
        F.about = f(g2, 'About the company', 'about', 'textarea', { value: s.about, full: true });
        F.contacts = f(g2, 'Contacts (one per line: name | title | what to ask about | email)', 'contacts', 'textarea', { value: lines(s.contacts), full: true, rows: 3 });
        F.links = f(g2, 'Links (one per line: label | https://…)', 'links', 'textarea', { value: lines(s.links), full: true, rows: 3 });
        F.address = f(g2, 'Address line', 'address', 'text', { value: s.address, full: true });
        F.help_email = f(g2, 'Help email', 'help_email', 'email', { value: s.help_email });
        F.idle_minutes = f(g2, 'Sign out after inactivity (minutes)', 'idle_minutes', 'number', { value: s.idle_minutes });
        var c3 = card('The round (what prospective investors see)'), g3 = grid(c3);
        F.offer_on = f(g3, 'Show the round to prospects, unit holders and admins', 'offer_on', 'checkbox', { value: s.offer_on !== false, full: true });
        F.offer_title = f(g3, 'Title in the menu', 'offer_title', 'text', { value: s.offer_title });
        F.offer_raise = f(g3, 'Raise ($)', 'offer_raise', 'number', { value: s.offer_raise });
        F.offer_pre = f(g3, 'Pre-money valuation ($)', 'offer_pre', 'number', { value: s.offer_pre, hint: 'Price per unit = pre-money ÷ units outstanding' });
        F.offer_min = f(g3, 'Minimum investment', 'offer_min', 'text', { value: s.offer_min, hint: 'Blank shows “Ask us”' });
        F.offer_security = f(g3, 'Security', 'offer_security', 'text', { value: s.offer_security, full: true });
        F.offer_email = f(g3, 'Email for “Talk to Sarvesh”', 'offer_email', 'email', { value: s.offer_email });
        F.offer_dilution = f(g3, 'Default later-round dilution (%)', 'offer_dilution', 'number', { value: s.offer_dilution });
        F.offer_exits = f(g3, 'Example sale prices ($, comma separated)', 'offer_exits', 'text', { value: (s.offer_exits || []).join(', '), full: true });
        F.offer_lead = f(g3, 'Headline paragraph', 'offer_lead', 'textarea', { value: s.offer_lead, full: true, rows: 3 });
        F.offer_highlights = f(g3, 'Why AeroAssist (one per line: title | text)', 'offer_highlights', 'textarea', { value: lines(s.offer_highlights), full: true, rows: 5 });
        F.offer_track = f(g3, 'Track record (one per line: big number | what it means)', 'offer_track', 'textarea', { value: lines(s.offer_track), full: true, rows: 3 });
        F.offer_use = f(g3, 'Use of funds (one per line: item | amount)', 'offer_use', 'textarea', { value: lines(s.offer_use), full: true, rows: 7 });
        F.offer_phases = f(g3, 'Phases (one per line: name | amount | when | what)', 'offer_phases', 'textarea', { value: lines(s.offer_phases), full: true, rows: 3 });
        F.offer_comps = f(g3, 'For scale: comparable deals (one per line: company | event | amount)', 'offer_comps', 'textarea', { value: lines(s.offer_comps), full: true, rows: 4 });
        F.offer_risks = f(g3, 'Risks (one per line: title | text)', 'offer_risks', 'textarea', { value: lines(s.offer_risks), full: true, rows: 8 });
        F.offer_steps = f(g3, 'How to invest (one per line: step | text)', 'offer_steps', 'textarea', { value: lines(s.offer_steps), full: true, rows: 4 });
        F.offer_note = f(g3, 'Legal note at the bottom', 'offer_note', 'textarea', { value: s.offer_note, full: true, rows: 3 });
        form.appendChild(c1); form.appendChild(c2); form.appendChild(c3);
        var bar = el('div'); var b = formbar(bar, 'Save settings'); form.appendChild(bar);
        form.onsubmit = function (e) {
          e.preventDefault(); b.disabled = true;
          var d = {};
          ['as_of', 'units_outstanding', 'unit_price', 'round_units', 'round_name', 'price_label', 'note', 'tax_note', 'about', 'address', 'help_email', 'idle_minutes'].forEach(function (k) { d[k] = F[k].value; });
          d.price_history = unlines(F.price_history.value, 3).map(function (r) { return { date: r[0], price: +String(r[1]).replace(/[$,]/g, ''), label: r[2] }; });
          d.announcements = unlines(F.announcements.value, 3).map(function (r) { return { date: r[0], title: r[1], body: r[2] }; });
          d.company_facts = unlines(F.company_facts.value, 2); d.contacts = unlines(F.contacts.value, 4); d.links = unlines(F.links.value, 2);
          ['offer_title', 'offer_raise', 'offer_pre', 'offer_min', 'offer_security', 'offer_email', 'offer_dilution', 'offer_lead', 'offer_note'].forEach(function (k) { d[k] = F[k].value; });
          d.offer_on = F.offer_on.checked;
          d.offer_exits = String(F.offer_exits.value).split(',').map(function (x) { return +x.replace(/[^0-9.]/g, ''); }).filter(function (x) { return x > 0; });
          d.offer_highlights = unlines(F.offer_highlights.value, 2); d.offer_track = unlines(F.offer_track.value, 2); d.offer_use = unlines(F.offer_use.value, 2);
          d.offer_phases = unlines(F.offer_phases.value, 4); d.offer_comps = unlines(F.offer_comps.value, 3); d.offer_risks = unlines(F.offer_risks.value, 2); d.offer_steps = unlines(F.offer_steps.value, 2);
          api('PUT', '/api/admin/settings', d).then(function () { banner(holder, 'Settings saved. People see them the next time they open the portal.'); window.scrollTo(0, 0); })
            .catch(function (err) { banner(holder, err.message, 'err'); }).then(function () { b.disabled = false; });
        };
        holder.appendChild(form);
      }).catch(fail(box));
    }

    /* ---------- import from the old static portal's private folder ---------- */
    function vImport(box) {
      var c = card('Import the old portal’s documents');
      c.appendChild(el('p', null, 'Choose the zip of the private portal-input folder. The library documents (library.csv and library/) and settings (settings.json) are uploaded and encrypted from your browser. People are not imported; add them under People so each gets their own sign-in link. Running it twice skips documents already here.'));
      var form = el('form'), g = grid(form);
      var file = f(g, 'portal-input zip', 'zip', 'file', { required: true, full: true }); file.accept = '.zip';
      var sett = f(g, 'Also import settings (unit price, history, announcements, company facts, tax note)', 'settings', 'checkbox', { value: true, full: true });
      var b = formbar(form, 'Import'); var prog = el('div', 'ip-progress'); form.appendChild(prog);
      form.onsubmit = function (e) {
        e.preventDefault(); if (!file.files[0]) return;
        b.disabled = true; prog.textContent = 'Reading the zip…';
        var J = window.JSZip ? Promise.resolve() : new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/vendor/jszip.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
        J.then(function () { return window.JSZip.loadAsync(file.files[0]); }).then(function (z) {
          var names = Object.keys(z.files), base = '';
          names.forEach(function (n) { var m = /^(.*?)library\.csv$/.exec(n); if (m && !base) base = m[1]; });
          var get = function (p) { var e = z.file(base + p); return e ? e : null; };
          return api('GET', '/api/admin/documents').then(function (existing) {
            var have = {}; existing.forEach(function (d) { have[d.grp + '|' + d.title] = 1; });
            var steps = [];
            if (sett.checked && get('settings.json')) steps.push(get('settings.json').async('string').then(function (t) {
              var j = JSON.parse(t); return api('GET', '/api/admin/settings').then(function (s) {
                var map = { asOf: 'as_of', unitsOutstanding: 'units_outstanding', unitPrice: 'unit_price', priceLabel: 'price_label', priceHistory: 'price_history', announcements: 'announcements', taxNote: 'tax_note', companyFacts: 'company_facts' };
                Object.keys(map).forEach(function (k) { if (j[k] != null) s[map[k]] = j[k]; });
                return api('PUT', '/api/admin/settings', s).then(function () { prog.textContent += '\nSettings imported.'; });
              });
            }));
            var csvFile = get('library.csv');
            if (!csvFile) { prog.textContent += '\nNo library.csv found.'; return Promise.all(steps); }
            return Promise.all(steps).then(function () { return csvFile.async('string'); }).then(function (csv) {
              var rows = parseCsv(csv), head = rows.shift() || [], idx = {}; head.forEach(function (h, i) { idx[h.trim()] = i; });
              var added = 0, skipped = 0, problems = [];
              var chain = Promise.resolve();
              rows.forEach(function (r) {
                var row = function (k) { return (r[idx[k]] || '').trim(); };
                chain = chain.then(function () {
                  var grp = row('group'), title = row('title');
                  if (!GROUPS[grp] || !title) return;
                  if (have[grp + '|' + title]) { skipped++; return; }
                  var ent = get(row('file')); if (!ent) { problems.push(title + ' (file missing)'); return; }
                  prog.textContent = 'Uploading ' + title + '…\n' + added + ' added, ' + skipped + ' skipped';
                  return ent.async('blob').then(function (blob) {
                    var fd = new FormData(); fd.append('grp', grp); fd.append('category', row('category') || 'Documents'); fd.append('title', title); fd.append('description', row('description')); fd.append('doc_date', row('date'));
                    fd.append('file', new File([blob], row('file').split('/').pop()));
                    return api('POST', '/api/admin/documents', fd, true).then(function () { added++; }, function (err) { problems.push(title + ': ' + err.message); });
                  });
                });
              });
              return chain.then(function () { prog.textContent = 'Done. ' + added + ' documents added, ' + skipped + ' already here.' + (problems.length ? '\nProblems: ' + problems.join('; ') : '') + '\nNow delete the zip and any other copies of portal-input; they hold the documents unencrypted.'; });
            });
          });
        }).catch(function (err) { prog.textContent = 'Import failed: ' + err.message; }).then(function () { b.disabled = false; });
      };
      c.appendChild(form); box.appendChild(c);
    }
    function parseCsv(t) {
      var out = [], row = [], cur = '', q = false;
      t = t.replace(/^﻿/, '');
      for (var i = 0; i < t.length; i++) {
        var ch = t[i];
        if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (x) { return x !== ''; })) out.push(row); row = []; }
        else cur += ch;
      }
      row.push(cur); if (row.some(function (x) { return x !== ''; })) out.push(row);
      return out;
    }

    return {
      people: { title: ['People', 'Administrator'], render: vPeople },
      person: { title: ['Person', 'Administrator'], render: vPerson, hidden: true },
      library: { title: ['Manage documents', 'Administrator'], render: vLibrary },
      txns: { title: ['Transactions', 'Administrator'], render: vTxns },
      log: { title: ['Activity log', 'Administrator'], render: vLog },
      settings: { title: ['Settings', 'Administrator'], render: vSettings },
      import: { title: ['Import', 'Administrator'], render: vImport },
    };
  };
})();
