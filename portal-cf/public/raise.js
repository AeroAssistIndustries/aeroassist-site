/* AeroAssist portal: the raise tracker. Shown only to the RAISE_OWNER account; the server refuses everyone else.
   Today (what to do now), Pipeline (everyone), Emails (one-tap personal emails), Report, Playbook. */
(function () {
  'use strict';
  window.AAPRaise = function (O, api) {
    var STATUS = [['to_contact', 'To contact'], ['emailed', 'Emailed'], ['maybe', 'Maybe'], ['yes', 'Yes'], ['committed', 'Committed'], ['funded', 'Funded'], ['no', 'No']];
    var SL = {}; STATUS.forEach(function (s) { SL[s[0]] = s[1]; });
    var TIERS = ['Close', 'Professional', 'Introducer', 'List'];
    var PRI = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
    var LOGT = { email: 'Email', call: 'Call', text: 'Text', meeting: 'Meeting', note: 'Note', status: 'Status' };
    var D = null, loading = null, tab = 'today', F = { q: '', status: '', tier: '', sort: 'next' }, BOX = null, ME = null;
    try { tab = localStorage.getItem('aaRaiseTab') || 'today'; } catch (e) {}

    /* ---------- helpers ---------- */
    function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
    function btn(label, cls, fn) { var b = el('button', 'ip-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (fn) b.onclick = fn; return b; }
    function money(n) { return '$' + Math.round(+n || 0).toLocaleString('en-US'); }
    function short(n) { n = +n || 0; return n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 2 : 0) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : money(n); }
    function num(v) { return +String(v == null ? '' : v).replace(/[^0-9.]/g, '') || 0; }
    function iso(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
    function today() { return iso(new Date()); }
    function plus(n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fd(s) { if (!s) return ''; var p = String(s).split('-'); return MON[+p[1] - 1] + ' ' + (+p[2]); }
    function ago(sec) { if (!sec) return ''; var m = Math.round((Date.now() / 1000 - sec) / 60); if (m < 60) return m <= 1 ? 'just now' : m + ' min ago'; var h = Math.round(m / 60); if (h < 36) return h + 'h ago'; var d = Math.round(h / 24); return d + ' days ago'; }
    function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }
    function amt(p) { return p.status === 'funded' ? (p.funded || p.committed || p.soft) : p.status === 'committed' ? (p.committed || p.soft) : p.status === 'yes' ? p.soft : (p.funded || p.committed || p.soft || 0); }
    function open(p) { return ['funded', 'no'].indexOf(p.status) < 0; }
    function toast(t) { var x = document.getElementById('rsToast'); if (!x) { x = el('div', 'rs-toast'); x.id = 'rsToast'; x.setAttribute('role', 'status'); document.body.appendChild(x); } x.textContent = t; x.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { x.hidden = true; }, 2600); }
    function copy(text, what) { var ok = function () { toast((what || 'Text') + ' copied'); }; try { navigator.clipboard.writeText(text).then(ok, fb); } catch (e) { fb(); } function fb() { var a = el('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (e2) { toast('Copy didn’t work here. Select the text and copy it.'); } a.remove(); } }
    function newId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function price() { var r = (D && D.round) || {}; return r.pre && r.units ? r.pre / r.units : 2000; }
    function goal() { return (D && D.round && D.round.raise) || 2000000; }
    function unitsFor(a) { return Math.floor((+a || 0) / price()); }
    function ownership(a) { var r = (D && D.round) || {}, out = (r.units || 10000) + Math.round(goal() / price()); return unitsFor(a) / out * 100; }
    function portal(p) { return p.email && D.portal[String(p.email).toLowerCase()] || null; }
    function pstate(p) { var x = portal(p); if (!x) return { t: p.email ? 'Not invited' : 'No email', c: '' }; if (!x.ready) return { t: 'Invited, not set up', c: 'warn' }; return { t: 'Signed in' + (x.last_signin ? ' · ' + ago(x.last_signin) : ''), c: 'good' }; }
    function heat(p) { var x = portal(p); if (!x || !x.week) return 0; var h = x.week.round * 3 + x.week.docs; if (x.round && x.round.last > Date.now() / 1000 - 172800) h += 5; return h; }
    function byId(id) { return D.people.filter(function (p) { return p.id === id; })[0]; }

    /* ---------- data ---------- */
    function load(force) {
      if (D && !force) return Promise.resolve(D);
      if (loading) return loading;
      loading = api('GET', '/api/raise').then(function (r) { D = r; D.people = D.people || []; loading = null; return D; }, function (e) { loading = null; throw e; });
      return loading;
    }
    function save(p, msg) {
      var body = {}; for (var k in p) if (k !== 'id') body[k] = p[k];
      return api('PUT', '/api/raise/' + p.id, { data: body }).then(function (r) {
        var i = D.people.findIndex(function (x) { return x.id === p.id; });
        if (i >= 0) D.people[i] = r.person; else D.people.push(r.person);
        if (msg) toast(msg); draw(); return r.person;
      }).catch(function (e) { toast(e.message || 'Couldn’t save. Try again.'); throw e; });
    }
    function clone(p) { return JSON.parse(JSON.stringify(p)); }
    function addLog(p, t, x, d) { p.log = (p.log || []).concat([{ d: d || today(), t: t, x: x }]); }
    function setStatus(p0, st) {
      var p = clone(p0), was = p.status;
      p.status = was === st ? 'emailed' : st; p.last = today();
      if (p.status === 'maybe') { if (!p.nextDate || p.nextDate < today()) p.nextDate = plus(7); if (!p.next) p.next = 'Call, or send the portal login'; }
      if (p.status === 'yes') { p.nextDate = plus(2); p.next = p.soft ? 'NDA, then subscription documents' : 'Ask the amount, then NDA'; p.priority = 'hot'; }
      if (p.status === 'no') { p.nextDate = ''; p.next = ''; p.priority = 'cold'; }
      addLog(p, 'status', 'Marked ' + SL[p.status]);
      return save(p, p.name + ': ' + SL[p.status]).then(function (s) { if (s.status === 'yes' && !s.soft) sheet(s, 'soft'); });
    }

    /* ---------- the view ---------- */
    function render(box, act) {
      BOX = box; box.textContent = '';
      act.appendChild(btn('Add a person', 'pri', function () { sheet(null); }));
      act.appendChild(btn('Refresh', '', function () { load(true).then(draw).catch(function (e) { toast(e.message); }); }));
      var w = el('p', 'ip-empty', 'Loading your pipeline…'); box.appendChild(w);
      load().then(draw).catch(function (e) { box.textContent = ''; box.appendChild(el('p', 'ip-banner err', e.message || 'The tracker couldn’t load.')); });
    }
    function draw() {
      if (!BOX || !D) return; var box = BOX; box.textContent = '';
      box.appendChild(meter());
      var seg = el('div', 'ip-seg rs-tabs'); seg.setAttribute('role', 'tablist');
      [['today', 'Today'], ['pipe', 'Pipeline'], ['mail', 'Emails'], ['report', 'Report'], ['play', 'Playbook']].forEach(function (t) {
        var b = el('button', null, t[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(tab === t[0])); b.onclick = function () { tab = t[0]; try { localStorage.setItem('aaRaiseTab', tab); } catch (e) {} draw(); }; seg.appendChild(b);
      });
      box.appendChild(seg);
      ({ today: vToday, pipe: vPipe, mail: vMail, report: vReport, play: vPlay }[tab] || vToday)(box);
    }

    /* ---------- goal meter ---------- */
    function totals() {
      var t = { f: 0, c: 0, s: 0, nF: 0, nC: 0, nS: 0, counts: {}, firstMoney: null };
      STATUS.forEach(function (s) { t.counts[s[0]] = 0; });
      D.people.forEach(function (p) {
        t.counts[p.status] = (t.counts[p.status] || 0) + 1;
        if (p.status === 'funded') { t.f += amt(p); t.nF++; } else if (p.status === 'committed') { t.c += amt(p); t.nC++; } else if (p.status === 'yes') { t.s += +p.soft || 0; t.nS++; }
        if (p.status === 'funded' || p.status === 'committed') (p.log || []).forEach(function (l) { if (l.t === 'status' && /Committed|Funded/.test(l.x) && (!t.firstMoney || l.d < t.firstMoney)) t.firstMoney = l.d; });
      });
      return t;
    }
    function meter() {
      var t = totals(), G = goal(), have = t.f + t.c, c = el('section', 'ip-card rs-goal');
      var h = el('div', 'rs-goal-h'); h.appendChild(el('b', null, money(have)));
      h.appendChild(el('span', null, 'funded or committed of ' + money(G) + ' · ' + Math.round(have / G * 100) + '%' + (t.s ? ' · ' + short(t.s) + ' more in soft yeses' : ''))); c.appendChild(h);
      var bar = el('div', 'rs-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', money(t.f) + ' funded, ' + money(t.c) + ' committed, ' + money(t.s) + ' soft yes, of ' + money(G));
      [['f', t.f], ['c', t.c], ['s', t.s]].forEach(function (x, i) { var used = i === 0 ? 0 : i === 1 ? t.f : t.f + t.c; var w = Math.max(0, Math.min(x[1], G - used)) / G * 100; var s = el('i', 'rs-' + x[0]); s.style.width = w + '%'; bar.appendChild(s); });
      var ph = el('span', 'rs-mark'); ph.style.left = (200000 / G * 100) + '%'; ph.title = 'Phase 1: $200K'; bar.appendChild(ph);
      c.appendChild(bar);
      var lg = el('div', 'rs-legend');
      [['rs-f', 'Funded', t.f, t.nF], ['rs-c', 'Committed', t.c, t.nC], ['rs-s', 'Soft yes', t.s, t.nS]].forEach(function (x) { var s = el('span'); s.appendChild(el('i', x[0])); s.appendChild(document.createTextNode(x[1] + ' ' + money(x[2]) + (x[3] ? ' (' + x[3] + ')' : ''))); lg.appendChild(s); });
      var ph1 = el('span'); ph1.appendChild(el('i', 'rs-markkey')); ph1.appendChild(document.createTextNode(have >= 200000 ? 'Phase 1 ($200K) reached' : 'Phase 1 needs ' + short(200000 - have) + ' more')); lg.appendChild(ph1);
      c.appendChild(lg);
      var n = t.nF + t.nC, avg = n ? have / n : 0, left = Math.max(0, G - have), strip = el('div', 'ip-strip rs-strip');
      var pace = null; if (t.firstMoney && have) { var wks = Math.max(1, (Date.now() - Date.parse(t.firstMoney)) / 6048e5); pace = have / wks; }
      [['Still to raise', short(left)], ['Average check', n ? short(avg) : '—'], ['Investors needed at that size', n && left ? String(Math.ceil(left / avg)) : '—'], ['Pace', pace ? short(pace) + '/wk' + (left ? ' · ' + Math.ceil(left / pace) + ' wks left' : '') : 'Starts with the first commitment']].forEach(function (x) {
        var d = el('div', 'ip-stat'); d.appendChild(el('span', null, x[0])); d.appendChild(el('b', null, x[1])); strip.appendChild(d);
      });
      c.appendChild(strip);
      var cnt = el('div', 'rs-counts');
      STATUS.forEach(function (s) { var b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(tab === 'pipe' && F.status === s[0])); b.appendChild(el('span', null, s[1])); b.appendChild(el('b', null, String(t.counts[s[0]] || 0))); b.onclick = function () { tab = 'pipe'; F.status = F.status === s[0] && tab === 'pipe' ? '' : s[0]; draw(); }; cnt.appendChild(b); });
      c.appendChild(cnt);
      return c;
    }

    /* ---------- TODAY ---------- */
    function vToday(box) {
      if (!D.people.length) { box.appendChild(emptyState()); return; }
      var g = el('div', 'ip-grid ip-2'), L = el('div', 'ip-grid'), R = el('div', 'ip-grid');
      var due = D.people.filter(function (p) { return open(p) && p.nextDate && p.nextDate <= today(); }).sort(function (a, b) { return a.nextDate.localeCompare(b.nextDate) || (b.priority === 'hot') - (a.priority === 'hot'); });
      var c1 = el('section', 'ip-card'); var h1 = el('h2', null, 'Follow up today'); h1.appendChild(el('small', null, due.length ? due.length + ' due' : 'All caught up')); c1.appendChild(h1);
      if (!due.length) c1.appendChild(el('p', 'ip-empty', 'Nothing is due. Work the next names in Pipeline → To contact, starting with Hot.'));
      due.slice(0, 25).forEach(function (p) { c1.appendChild(actionRow(p, true)); });
      L.appendChild(c1);
      var fresh = D.people.filter(function (p) { return p.status === 'to_contact'; }).sort(function (a, b) { var o = { hot: 0, warm: 1, cold: 2 }; return o[a.priority] - o[b.priority] || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier); });
      var c2 = el('section', 'ip-card'); var h2 = el('h2', null, 'Next to contact'); h2.appendChild(el('small', null, fresh.length + ' not contacted yet')); c2.appendChild(h2);
      if (!fresh.length) c2.appendChild(el('p', 'ip-empty', 'Everyone on the list has been contacted. Add more names.'));
      fresh.slice(0, 10).forEach(function (p) { c2.appendChild(actionRow(p, false)); });
      if (fresh.length) c2.appendChild(el('p', 'ip-empty rs-hint', 'Aim for 10–15 personal emails a day, each followed by a text.'));
      L.appendChild(c2);
      var hot = D.people.filter(function (p) { return heat(p) > 0 && open(p); }).sort(function (a, b) { return heat(b) - heat(a); });
      var c3 = el('section', 'ip-card'); var h3 = el('h2', null, 'Reading the round right now'); h3.appendChild(el('small', null, 'From the portal, last 7 days')); c3.appendChild(h3);
      if (!hot.length) c3.appendChild(el('p', 'ip-empty', 'When someone you invited opens the round page or the documents, they show up here. Call them while it’s fresh.'));
      hot.slice(0, 8).forEach(function (p) {
        var x = portal(p), r = el('div', 'rs-row'), d = el('div'); d.appendChild(nameBtn(p));
        d.appendChild(el('span', 'rs-sub', (x.week.round ? 'Opened the round page ' + x.week.round + '×' : '') + (x.week.round && x.week.docs ? ' · ' : '') + (x.week.docs ? x.week.docs + ' document' + (x.week.docs > 1 ? 's' : '') : '') + (x.round && x.round.last ? ' · last ' + ago(x.round.last) : '')));
        r.appendChild(d); var a = el('div', 'rs-acts'); if (p.phone) { var tel = el('a', 'ip-btn sm', 'Call'); tel.href = 'tel:' + p.phone.replace(/[^\d+]/g, ''); a.appendChild(tel); } a.appendChild(btn('Log a call', 'sm', function () { logSheet(p, 'call'); })); r.appendChild(a); c3.appendChild(r);
      });
      R.appendChild(c3);
      var loose = [];
      D.people.forEach(function (p) {
        if (p.status === 'yes' && !p.soft) loose.push([p, 'Said yes, but no amount recorded']);
        else if ((p.status === 'yes' || p.status === 'committed') && !p.nda) loose.push([p, SL[p.status] + ', NDA not signed']);
        else if (p.status === 'maybe' && !p.nextDate) loose.push([p, 'Maybe, with no follow-up date']);
        else if (p.status === 'maybe' && !portal(p) && p.email) loose.push([p, 'Maybe, not invited to the portal yet']);
        else if (p.status === 'committed' && (p.accredited === 'unknown' || p.accredited === 'no')) loose.push([p, 'Committed, accreditation not confirmed']);
        var x = portal(p); if (x && !x.ready && open(p) && p.status !== 'to_contact') loose.push([p, 'Invited to the portal but hasn’t set up the login']);
      });
      var c4 = el('section', 'ip-card'); var h4 = el('h2', null, 'Loose ends'); h4.appendChild(el('small', null, loose.length ? loose.length + ' to tidy' : 'None')); c4.appendChild(h4);
      if (!loose.length) c4.appendChild(el('p', 'ip-empty', 'Every Yes has an amount and an NDA, and every Maybe has a date.'));
      loose.slice(0, 12).forEach(function (x) { var r = el('div', 'rs-row'), d = el('div'); d.appendChild(nameBtn(x[0])); d.appendChild(el('span', 'rs-sub', x[1])); r.appendChild(d); r.appendChild(btn('Fix', 'sm', function () { sheet(x[0]); })); c4.appendChild(r); });
      R.appendChild(c4);
      R.appendChild(funnel());
      g.appendChild(L); g.appendChild(R); box.appendChild(g);
    }
    function actionRow(p, isDue) {
      var r = el('div', 'rs-row'), d = el('div'); d.appendChild(nameBtn(p));
      var bits = [p.tier]; if (p.next) bits.push(p.next); if (isDue) bits.push(p.nextDate === today() ? 'due today' : 'due ' + fd(p.nextDate));
      var sub = el('span', 'rs-sub' + (isDue && p.nextDate < today() ? ' late' : ''), bits.join(' · ')); d.appendChild(sub);
      var tag = el('span', 'ip-pill rs-st-' + p.status, SL[p.status]); tag.style.marginLeft = '8px'; d.firstChild.appendChild(tag);
      r.appendChild(d);
      var a = el('div', 'rs-acts');
      a.appendChild(btn('Email', 'sm pri', function () { compose(p); }));
      if (isDue) { a.appendChild(btn('+3 days', 'sm', function () { var q = clone(p); q.nextDate = plus(3); save(q, 'Moved to ' + fd(q.nextDate)); })); a.appendChild(btn('Done', 'sm', function () { var q = clone(p); q.nextDate = ''; q.next = ''; q.last = today(); addLog(q, 'note', 'Follow-up done'); save(q, 'Done'); })); }
      a.appendChild(quick(p));
      r.appendChild(a); return r;
    }
    function funnel() {
      var t = totals(), c = el('section', 'ip-card'), h = el('h2', null, 'Funnel'); h.appendChild(el('small', null, 'Everyone who reached each stage')); c.appendChild(h);
      var reached = function (sts) { return D.people.filter(function (p) { return sts.indexOf(p.status) >= 0; }).length; };
      var rows = [['Contacted', reached(['emailed', 'maybe', 'yes', 'committed', 'funded', 'no'])], ['Interested (Maybe or better)', reached(['maybe', 'yes', 'committed', 'funded'])], ['Said yes', reached(['yes', 'committed', 'funded'])], ['Signed', reached(['committed', 'funded'])], ['Funded', reached(['funded'])]];
      var top = Math.max(1, rows[0][1]), f = el('div', 'rs-funnel');
      rows.forEach(function (x) { var r = el('div', 'rs-frow'); r.appendChild(el('span', null, x[0])); var b = el('span', 'rs-fbar'); var i = el('i'); i.style.width = (x[1] / top * 100) + '%'; b.appendChild(i); r.appendChild(b); r.appendChild(el('b', null, x[1] + (x !== rows[0] && rows[0][1] ? ' · ' + Math.round(x[1] / rows[0][1] * 100) + '%' : ''))); f.appendChild(r); });
      c.appendChild(f); return c;
    }
    function emptyState() {
      var c = el('section', 'ip-card rs-empty');
      c.appendChild(el('h2', null, 'Start with the 20 people who know you best'));
      c.appendChild(el('p', null, 'Add them one at a time, or paste a list from your phone contacts, Gmail or LinkedIn. Then work the Today tab every morning.'));
      var a = el('div', 'rs-acts'); a.appendChild(btn('Add a person', 'pri', function () { sheet(null); })); a.appendChild(btn('Paste a list', '', function () { tab = 'pipe'; draw(); pasteOpen = true; draw(); })); c.appendChild(a);
      return c;
    }

    /* ---------- PIPELINE ---------- */
    var pasteOpen = false;
    function vPipe(box) {
      var bar = el('div', 'ip-filters');
      var q = el('input'); q.type = 'search'; q.placeholder = 'Search names, companies, notes'; q.value = F.q; q.setAttribute('aria-label', 'Search'); q.id = 'rsQ';
      q.oninput = function () { F.q = q.value; list(); }; bar.appendChild(q);
      var st = el('select'); st.setAttribute('aria-label', 'Status'); st.appendChild(new Option('Every status', '')); STATUS.forEach(function (s) { st.appendChild(new Option(s[1], s[0])); }); st.value = F.status; st.onchange = function () { F.status = st.value; draw(); }; bar.appendChild(st);
      var ti = el('select'); ti.setAttribute('aria-label', 'Group'); ti.appendChild(new Option('Every group', '')); TIERS.forEach(function (t) { ti.appendChild(new Option(t, t)); }); ti.value = F.tier; ti.onchange = function () { F.tier = ti.value; list(); }; bar.appendChild(ti);
      var so = el('select'); so.setAttribute('aria-label', 'Sort'); [['next', 'Sort: next follow-up'], ['hot', 'Sort: hottest'], ['amount', 'Sort: amount'], ['name', 'Sort: name'], ['recent', 'Sort: recently changed']].forEach(function (x) { so.appendChild(new Option(x[1], x[0])); }); so.value = F.sort; so.onchange = function () { F.sort = so.value; list(); }; bar.appendChild(so);
      bar.appendChild(btn('Paste a list', '', function () { pasteOpen = !pasteOpen; draw(); }));
      bar.appendChild(btn('Copy as CSV', '', csv));
      box.appendChild(bar);
      if (pasteOpen) box.appendChild(pasteCard());
      var wrap = el('div'); box.appendChild(wrap);
      function list() {
        wrap.textContent = '';
        var rows = visible();
        if (!D.people.length) { wrap.appendChild(emptyState()); return; }
        var tw = el('div', 'ip-tw rs-tw'), t = el('table', 'ip-table rs-table'), th = el('thead'), tr = el('tr');
        ['Name', 'Group', 'Status', 'Answer', 'Amount', 'Next step', 'Last contact', 'Portal'].forEach(function (h, i) { tr.appendChild(el('th', i === 4 ? 'n' : null, h)); }); th.appendChild(tr); t.appendChild(th);
        var tb = el('tbody'), cards = el('div', 'rs-cards');
        rows.forEach(function (p) {
          var r = el('tr'), td = function (c, cls) { var x = el('td', cls); if (c instanceof Node) x.appendChild(c); else x.textContent = c; r.appendChild(x); };
          var nm = el('div'); nm.appendChild(nameBtn(p)); var sub = [p.company, p.source].filter(Boolean).join(' · '); if (sub) nm.appendChild(el('span', 'rs-sub', sub));
          td(nm); td(p.tier); td(el('span', 'ip-pill rs-st-' + p.status, SL[p.status])); td(quick(p)); td(amt(p) ? short(amt(p)) : '—', 'n');
          td(el('span', p.nextDate && p.nextDate <= today() && open(p) ? 'late' : null, (p.next || (p.nextDate ? 'Follow up' : '—')) + (p.nextDate ? ' · ' + (p.nextDate === today() ? 'today' : fd(p.nextDate)) : '')));
          td(p.last ? fd(p.last) : 'Never'); var ps = pstate(p); td(el('span', 'ip-pill' + (ps.c ? ' ' + ps.c : ''), ps.t));
          tb.appendChild(r);
          var c = el('div', 'rs-card'), a = el('div', 'rs-row'), b = el('div', 'rs-row');
          var cn = el('div'); cn.appendChild(nameBtn(p)); cn.appendChild(el('span', 'rs-sub', [p.tier, p.next, p.nextDate ? fd(p.nextDate) : ''].filter(Boolean).join(' · '))); a.appendChild(cn); a.appendChild(el('span', 'ip-pill rs-st-' + p.status, SL[p.status]));
          b.appendChild(quick(p)); var bb = el('div', 'rs-acts'); if (amt(p)) bb.appendChild(el('b', null, short(amt(p)))); bb.appendChild(btn('Email', 'sm pri', function () { compose(p); })); b.appendChild(bb);
          c.appendChild(a); c.appendChild(b); cards.appendChild(c);
        });
        if (!rows.length) { var er = el('tr'), ec = el('td', null, 'No one matches these filters.'); ec.colSpan = 8; er.appendChild(ec); tb.appendChild(er); cards.appendChild(el('p', 'ip-empty', 'No one matches these filters.')); }
        t.appendChild(tb); tw.appendChild(t); wrap.appendChild(tw); wrap.appendChild(cards);
        wrap.appendChild(el('p', 'ip-empty', rows.length + ' of ' + D.people.length + ' people'));
      }
      list();
    }
    function visible() {
      var q = F.q.trim().toLowerCase();
      var rows = D.people.filter(function (p) {
        if (F.status && p.status !== F.status) return false; if (F.tier && p.tier !== F.tier) return false;
        if (q && [p.name, p.email, p.company, p.source, p.notes, p.next].join(' ').toLowerCase().indexOf(q) < 0) return false; return true;
      });
      var s = F.sort, o = { hot: 0, warm: 1, cold: 2 };
      rows.sort(function (a, b) {
        if (s === 'name') return a.name.localeCompare(b.name);
        if (s === 'amount') return amt(b) - amt(a);
        if (s === 'recent') return (b.updated || 0) - (a.updated || 0);
        if (s === 'hot') return heat(b) - heat(a) || o[a.priority] - o[b.priority] || a.name.localeCompare(b.name);
        return (a.nextDate || '9999').localeCompare(b.nextDate || '9999') || o[a.priority] - o[b.priority] || a.name.localeCompare(b.name);
      });
      return rows;
    }
    function nameBtn(p) {
      var w = el('span', 'rs-nm'); var dot = el('i', 'rs-dot rs-' + p.priority); dot.title = PRI[p.priority]; w.appendChild(dot);
      var b = el('button', 'ip-linkbtn nm', p.name); b.type = 'button'; b.onclick = function () { sheet(p); }; w.appendChild(b); return w;
    }
    function quick(p) {
      var w = el('span', 'rs-quick');
      [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']].forEach(function (x) { var b = el('button', 'rs-q-' + x[0], x[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(p.status === x[0])); b.setAttribute('aria-label', 'Mark ' + p.name + ' ' + x[1]); b.onclick = function () { setStatus(p, x[0]); }; w.appendChild(b); });
      return w;
    }

    /* ---------- paste a list ---------- */
    function parseCsv(t) {
      var out = [], row = [], cur = '', q = false; t = t.replace(/^﻿/, '');
      for (var i = 0; i < t.length; i++) { var ch = t[i];
        if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',' || ch === '\t') { row.push(cur.trim()); cur = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); cur = ''; if (row.some(Boolean)) out.push(row); row = []; }
        else cur += ch; }
      row.push(cur.trim()); if (row.some(Boolean)) out.push(row); return out;
    }
    function fromRows(rows) {
      if (!rows.length) return [];
      var h = rows[0].map(function (x) { return x.toLowerCase(); }), has = function (re) { return h.findIndex(function (x) { return re.test(x); }); };
      var iFirst = has(/^first name$|^given name$/), iLast = has(/^last name$|^family name$/), iName = has(/^name$|^full name$/), iEmail = has(/e-?mail( address)?( 1)?( - value)?$/), iPhone = has(/^phone( 1)?( - value)?$|mobile|^phone number$/), iCo = has(/^company$|organi[sz]ation( 1)?( - )?name$|^organization$/), iPos = has(/^position$|title$/);
      var header = (iFirst >= 0 || iName >= 0) && (iEmail >= 0 || iCo >= 0 || iLast >= 0);
      if (header) {
        return rows.slice(1).map(function (r) {
          var name = iName >= 0 ? r[iName] : [r[iFirst], iLast >= 0 ? r[iLast] : ''].filter(Boolean).join(' ');
          return { name: name, email: iEmail >= 0 ? r[iEmail] : '', phone: iPhone >= 0 ? r[iPhone] : '', company: [iCo >= 0 ? r[iCo] : '', iPos >= 0 ? r[iPos] : ''].filter(Boolean).join(', '), tier: 'Professional' };
        }).filter(function (p) { return p.name; });
      }
      return rows.map(function (c) {
        var email = c.filter(function (x) { return /@/.test(x); })[0] || '', tier = TIERS.filter(function (t) { return c.some(function (x) { return x.toLowerCase() === t.toLowerCase(); }); })[0] || 'Professional';
        var rest = c.slice(1).filter(function (x) { return x && x !== email && x.toLowerCase() !== tier.toLowerCase(); }), phone = rest.filter(function (x) { return /^[+()\d][\d\s().-]{6,}$/.test(x); })[0] || '';
        return { name: c[0], email: email, phone: phone, tier: tier, source: rest.filter(function (x) { return x !== phone; }).join(', ') };
      }).filter(function (p) { return p.name && !/@/.test(p.name); });
    }
    function pasteCard() {
      var c = el('section', 'ip-card'); c.appendChild(el('h2', null, 'Paste a list'));
      c.appendChild(el('p', 'ip-empty', 'Paste lines like “Name, email, phone, group, how you know them”, or a whole CSV export from Gmail, Google Contacts, Outlook or LinkedIn (with its header row). People already on the list are skipped.'));
      var ta = el('textarea', 'rs-paste'); ta.rows = 7; ta.id = 'rsPaste'; ta.setAttribute('aria-label', 'People to add'); ta.placeholder = 'Pat Lee, pat@example.com, 602-555-0100, Close, College roommate'; c.appendChild(ta);
      var g = el('div', 'rs-acts'); var tsel = el('select'); tsel.setAttribute('aria-label', 'Group for people without one'); TIERS.forEach(function (t) { tsel.appendChild(new Option('Group if not given: ' + t, t)); }); tsel.value = 'Professional';
      var go = btn('Add these people', 'pri'), msg = el('span', 'ip-empty');
      g.appendChild(tsel); g.appendChild(go); g.appendChild(btn('Cancel', '', function () { pasteOpen = false; draw(); })); g.appendChild(msg); c.appendChild(g);
      var fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.csv,text/csv,text/plain'; fileIn.setAttribute('aria-label', 'Or choose a CSV file'); fileIn.onchange = function () { var f = fileIn.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { ta.value = String(rd.result); msg.textContent = f.name + ' loaded. Check it, then add.'; }; rd.readAsText(f); };
      var fl = el('label', 'rs-file'); fl.appendChild(document.createTextNode('Or choose a CSV file: ')); fl.appendChild(fileIn); c.appendChild(fl);
      go.onclick = function () {
        var list = fromRows(parseCsv(ta.value)); if (!list.length) { msg.textContent = 'Nothing to add. Paste at least one name.'; return; }
        var have = {}; D.people.forEach(function (p) { if (p.email) have[p.email.toLowerCase()] = 1; have['n:' + p.name.toLowerCase()] = 1; });
        var add = list.filter(function (p) { var k = p.email ? p.email.toLowerCase() : 'n:' + p.name.toLowerCase(); if (have[k] || have['n:' + p.name.toLowerCase()] && !p.email) return false; have[k] = 1; return true; });
        var skipped = list.length - add.length; if (!add.length) { msg.textContent = 'Everyone there is already on the list.'; return; }
        go.disabled = true; var i = 0, ok = 0;
        (function next() {
          if (i >= add.length) { go.disabled = false; msg.textContent = 'Added ' + ok + (skipped ? ', skipped ' + skipped + ' already here' : '') + '.'; if (ok === add.length) ta.value = ''; return; }
          var p = add[i++]; msg.textContent = 'Adding ' + i + ' of ' + add.length + '…';
          var rec = { id: newId(), name: p.name, email: p.email || '', phone: p.phone || '', company: p.company || '', source: p.source || '', tier: TIERS.indexOf(p.tier) >= 0 && p.tier !== 'Professional' ? p.tier : tsel.value, status: 'to_contact', priority: 'warm', accredited: 'unknown', log: [] };
          api('PUT', '/api/raise/' + rec.id, { data: rec }).then(function (r) { D.people.push(r.person); ok++; }).catch(function () {}).then(next);
        })();
      };
      return c;
    }
    function csv() {
      var cols = ['name', 'email', 'phone', 'company', 'tier', 'status', 'priority', 'source', 'soft', 'committed', 'funded', 'accredited', 'next', 'nextDate', 'last', 'nda', 'demo', 'notes'];
      var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      copy(cols.join(',') + '\n' + visible().map(function (p) { return cols.map(function (c) { return q(c === 'status' ? SL[p.status] : p[c]); }).join(','); }).join('\n'), visible().length + ' rows (CSV)');
    }

    /* ---------- person sheet ---------- */
    function modal(title) {
      var bg = el('div', 'rs-modal'), inner = el('div', 'rs-sheet'); inner.setAttribute('role', 'dialog'); inner.setAttribute('aria-modal', 'true'); inner.setAttribute('aria-label', title);
      var h = el('div', 'rs-sheet-h'); h.appendChild(el('h2', null, title)); var x = btn('Close', 'sm'); h.appendChild(x); inner.appendChild(h);
      bg.appendChild(inner); document.body.appendChild(bg);
      var close = function () { bg.remove(); document.removeEventListener('keydown', esc); };
      function esc(e) { if (e.key === 'Escape') close(); }
      x.onclick = close; bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); }); document.addEventListener('keydown', esc);
      return { body: inner, close: close };
    }
    function fld(g, label, name, type, val, opts) {
      opts = opts || {}; var l = el('label', 'ip-f' + (opts.full ? ' full' : '')); l.appendChild(el('span', null, label)); var i;
      if (type === 'select') { i = el('select'); opts.options.forEach(function (o) { i.appendChild(new Option(o[1], o[0])); }); }
      else if (type === 'textarea') { i = el('textarea'); i.rows = opts.rows || 4; }
      else { i = el('input'); i.type = type; if (opts.inputmode) i.inputMode = opts.inputmode; if (opts.placeholder) i.placeholder = opts.placeholder; }
      i.name = name; i.id = 'rs_' + name; if (val != null) i.value = val; l.appendChild(i); if (opts.hint) l.appendChild(el('small', null, opts.hint)); g.appendChild(l); return i;
    }
    function sheet(p0, focus) {
      var isNew = !p0, p = p0 ? clone(p0) : { id: newId(), status: 'to_contact', tier: 'Professional', priority: 'warm', accredited: 'unknown', log: [] };
      var m = modal(isNew ? 'Add a person' : p.name), b = m.body;
      if (!isNew) {
        var top = el('div', 'rs-acts');
        top.appendChild(btn('Email', 'sm pri', function () { m.close(); compose(byId(p.id) || p); }));
        if (p.phone) { var tel = el('a', 'ip-btn sm', 'Call ' + p.phone); tel.href = 'tel:' + p.phone.replace(/[^\d+]/g, ''); top.appendChild(tel); var sms = el('a', 'ip-btn sm', 'Text'); sms.href = 'sms:' + p.phone.replace(/[^\d+]/g, ''); top.appendChild(sms); }
        top.appendChild(btn('Log a call or meeting', 'sm', function () { m.close(); logSheet(byId(p.id) || p, 'call'); }));
        top.appendChild(btn(portal(p) ? 'New portal link' : 'Invite to the portal', 'sm', function () { invite(byId(p.id) || p, m); }));
        b.appendChild(top);
        var ps = pstate(p), x = portal(p), info = el('p', 'ip-empty rs-portal');
        info.textContent = 'Portal: ' + ps.t + (x && x.round ? ' · opened the round page ' + x.round.n + '× (last ' + ago(x.round.last) + ')' : '') + (x && x.docs ? ' · ' + x.docs + ' document views' : '');
        b.appendChild(info);
      }
      var f = el('form'), g = el('div', 'ip-fg'); f.appendChild(g);
      var I = {};
      I.name = fld(g, 'Name', 'name', 'text', p.name, { full: true });
      I.email = fld(g, 'Email', 'email', 'email', p.email); I.phone = fld(g, 'Phone', 'phone', 'tel', p.phone);
      I.company = fld(g, 'Company and role', 'company', 'text', p.company); I.source = fld(g, 'How you know them', 'source', 'text', p.source, { placeholder: 'College friend, former client…' });
      I.tier = fld(g, 'Group', 'tier', 'select', p.tier, { options: TIERS.map(function (t) { return [t, t]; }) });
      I.status = fld(g, 'Status', 'status', 'select', p.status, { options: STATUS });
      I.priority = fld(g, 'Priority', 'priority', 'select', p.priority, { options: [['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'Cold']] });
      I.accredited = fld(g, 'Accredited?', 'accredited', 'select', p.accredited, { options: [['unknown', 'Not sure yet'], ['yes', 'Yes (they say so)'], ['verified', 'Verified'], ['no', 'No']] });
      I.soft = fld(g, 'Soft yes ($)', 'soft', 'text', p.soft ? Number(p.soft).toLocaleString('en-US') : '', { inputmode: 'numeric' });
      I.committed = fld(g, 'Committed ($, signed)', 'committed', 'text', p.committed ? Number(p.committed).toLocaleString('en-US') : '', { inputmode: 'numeric' });
      I.funded = fld(g, 'Funded ($, received)', 'funded', 'text', p.funded ? Number(p.funded).toLocaleString('en-US') : '', { inputmode: 'numeric' });
      var calc = el('p', 'ip-empty full rs-calc'); g.appendChild(calc);
      function upd() { var a = num(I.funded.value) || num(I.committed.value) || num(I.soft.value); calc.textContent = a ? money(a) + ' buys ' + unitsFor(a).toLocaleString('en-US') + ' units at ' + money(price()) + ' (' + money(unitsFor(a) * price()) + '), ' + ownership(a).toFixed(3) + '% after the full round.' : 'Enter an amount to see units and ownership.'; }
      [I.soft, I.committed, I.funded].forEach(function (i) { i.oninput = upd; }); upd();
      I.next = fld(g, 'Next step', 'next', 'text', p.next, { placeholder: 'Call Tuesday, send portal login…' }); I.nextDate = fld(g, 'Next step date', 'nextDate', 'date', p.nextDate);
      I.last = fld(g, 'Last contact', 'last', 'date', p.last);
      var opts = [['', 'Nobody']].concat(D.people.filter(function (x) { return x.id !== p.id; }).sort(function (a, b2) { return a.name.localeCompare(b2.name); }).map(function (x) { return [x.id, x.name]; }));
      I.introBy = fld(g, 'Introduced by', 'introBy', 'select', p.introBy || '', { options: opts });
      var chk = function (label, name) { var l = el('label', 'ip-check full'); var c = el('input'); c.type = 'checkbox'; c.checked = !!p[name]; c.id = 'rs_' + name; l.appendChild(c); l.appendChild(el('span', null, label)); g.appendChild(l); return c; };
      I.nda = chk('NDA signed', 'nda'); I.docs = chk('Subscription documents sent', 'docs'); I.demo = chk('Invite to the shop demo morning', 'demo');
      I.notes = fld(g, 'Notes', 'notes', 'textarea', p.notes, { full: true, rows: 4 });
      b.appendChild(f);
      var bar = el('div', 'rs-acts rs-sheetbar'), sv = btn('Save', 'pri'), msg = el('span', 'ip-empty');
      bar.appendChild(sv); bar.appendChild(btn('Cancel', '', m.close)); bar.appendChild(msg);
      if (!isNew) {
        var del = btn('Remove', 'danger'), conf = el('span', 'rs-confirm'); conf.hidden = true;
        conf.appendChild(document.createTextNode('Remove ' + p.name + '? ')); conf.appendChild(btn('Remove', 'sm danger', function () { api('DELETE', '/api/raise/' + p.id).then(function () { D.people = D.people.filter(function (x) { return x.id !== p.id; }); toast('Removed ' + p.name); m.close(); draw(); }).catch(function (e) { toast(e.message); }); })); conf.appendChild(btn('Keep', 'sm', function () { conf.hidden = true; }));
        del.onclick = function () { conf.hidden = false; }; bar.appendChild(del); bar.appendChild(conf);
      }
      b.appendChild(bar);
      sv.onclick = function () {
        if (!I.name.value.trim()) { msg.textContent = 'Add a name first.'; I.name.focus(); return; }
        var was = p.status;
        ['name', 'email', 'phone', 'company', 'source', 'tier', 'status', 'priority', 'accredited', 'next', 'nextDate', 'last', 'introBy', 'notes'].forEach(function (k) { p[k] = I[k].value.trim(); });
        ['soft', 'committed', 'funded'].forEach(function (k) { p[k] = num(I[k].value); }); p.nda = I.nda.checked; p.docs = I.docs.checked; p.demo = I.demo.checked;
        if (p.status === 'committed' && !p.committed) p.committed = p.soft; if (p.status === 'funded' && !p.funded) p.funded = p.committed || p.soft;
        if (was !== p.status && !isNew) addLog(p, 'status', 'Marked ' + SL[p.status]);
        sv.disabled = true; save(p, isNew ? 'Added ' + p.name : 'Saved').then(m.close).catch(function () { sv.disabled = false; });
      };
      if (!isNew && (p.log || []).length) {
        var lc = el('section', 'rs-log'); lc.appendChild(el('h3', null, 'History'));
        var ul = el('ul'); (p.log || []).slice().reverse().slice(0, 60).forEach(function (l) { var li = el('li'); li.appendChild(el('time', null, fd(l.d))); li.appendChild(el('b', null, LOGT[l.t] || 'Note')); li.appendChild(el('span', null, l.x)); ul.appendChild(li); });
        lc.appendChild(ul); b.appendChild(lc);
      }
      setTimeout(function () { (focus && I[focus] ? I[focus] : I.name).focus(); }, 30);
    }
    function logSheet(p0, type) {
      var p = clone(p0), m = modal('Log for ' + p.name), b = m.body, g = el('div', 'ip-fg');
      var t = fld(g, 'What happened', 'lt', 'select', type || 'call', { options: [['call', 'Call'], ['meeting', 'Meeting or visit'], ['email', 'Email'], ['text', 'Text'], ['note', 'Note']] });
      var d = fld(g, 'Date', 'ld', 'date', today());
      var x = fld(g, 'Notes', 'lx', 'textarea', '', { full: true, rows: 4 });
      var nx = fld(g, 'Next step', 'lnext', 'text', p.next, { placeholder: 'Send portal login, call back Friday…' });
      var nd = fld(g, 'Next step date', 'lnd', 'date', p.nextDate || plus(3));
      b.appendChild(g);
      var ans = el('div', 'rs-acts'); ans.appendChild(el('span', 'ip-empty', 'Where did it land?')); var pick = { v: '' };
      [['', 'No change'], ['maybe', 'Maybe'], ['yes', 'Yes'], ['no', 'No']].forEach(function (o) { var bb = btn(o[1], 'sm'); bb.setAttribute('aria-pressed', String(pick.v === o[0])); bb.onclick = function () { pick.v = o[0]; [].forEach.call(ans.querySelectorAll('button'), function (z) { z.setAttribute('aria-pressed', 'false'); }); bb.setAttribute('aria-pressed', 'true'); }; ans.appendChild(bb); });
      b.appendChild(ans);
      var bar = el('div', 'rs-acts rs-sheetbar'), sv = btn('Save', 'pri'); bar.appendChild(sv); bar.appendChild(btn('Cancel', '', m.close)); b.appendChild(bar);
      sv.onclick = function () {
        addLog(p, t.value, x.value.trim() || LOGT[t.value], d.value); p.last = d.value > (p.last || '') ? d.value : p.last; p.next = nx.value.trim(); p.nextDate = nd.value;
        if (p.status === 'to_contact') p.status = 'emailed';
        if (pick.v) { p.status = pick.v; addLog(p, 'status', 'Marked ' + SL[pick.v]); if (pick.v === 'no') { p.next = ''; p.nextDate = ''; } }
        sv.disabled = true; save(p, 'Logged').then(m.close).catch(function () { sv.disabled = false; });
      };
      setTimeout(function () { x.focus(); }, 30);
    }
    function invite(p, m) {
      if (!p.email) { toast('Add their email first.'); return; }
      if (!D.admin) { toast('Inviting needs your portal account to be an administrator.'); return; }
      api('POST', '/api/raise/' + p.id + '/invite').then(function (r) {
        if (m) m.close();
        load(true).then(function () { draw(); var cur = byId(p.id) || p; compose(cur, r.existing ? 'signin' : 'invite', r.link.url); });
        toast(r.existing ? 'They already have a login. Sending the sign-in page.' : r.created ? 'Portal login created' : 'New portal link made');
      }).catch(function (e) { toast(e.message); });
    }

    /* ---------- emails ---------- */
    var SIG = '\n\nSarvesh Joshi\nFounder & CEO, AeroAssist Industries\naeroassist.us · sarvesh@aeroassist.us';
    var FOOT = '\n\nThis email is not an offer to sell or a solicitation of an offer to buy securities. Any offer is made only through the subscription documents.';
    var MAILS = [
      { k: 'close', t: 'Close friends, family and earlier investors', w: 'First email · people who know you well', s: 'Something I wanted you to hear from me first', days: 4,
        b: 'Hi [First name],\n\nYou’ve watched me build AeroAssist since it was an idea in 2022, so I wanted you to hear this from me first.\n\nWe’ve now built about 50 aircraft in our Phoenix shop. They’re FCC certified and CE marked, and police, fire and transportation agencies in Arizona are working with us. The company is debt-free.\n\nWe’re raising $2M to finish our hybrid powertrain and get the XR-2 into production, and I’m sharing the details privately with a small group of people I know.\n\nIf you’d like a look, reply and I’ll send you a login to our private investor portal, with the terms, the plan and the documents. Or let’s talk for 20 minutes. Better still, come to the shop and watch one fly.\n\nNo pressure at all. If it isn’t for you, I’d still value your advice on who else I should talk to.\n\nSarvesh' + FOOT },
      { k: 'pro', t: 'Professional contacts', w: 'First email · clients, partners, former colleagues', s: 'AeroAssist: our next round, and why I thought of you', days: 4,
        b: 'Hi [First name],\n\nA quick update from AeroAssist, and an ask.\n\nWe design and build drone-as-first-responder aircraft in Phoenix. When a 911 call comes in, an aircraft launches from a dock and streams live video to responders before the first car arrives. We’ve built about 50 aircraft since 2022. They’re FCC certified and CE marked, built to the NDAA supply-chain rule, and we work with agencies including Phoenix PD, Chandler PD and Arizona DOT.\n\nWe’re raising $2M at a $20M pre-money valuation to finish our hybrid powertrain, scale manufacturing and put more stations in front of agencies. I thought of you because [one honest line about why them].\n\nIf you’re open to it, I’ll send you a login to our private investor portal. It has the terms, the use of funds, the risks and the documents. Or we can talk for 20 minutes this week.' + SIG + FOOT },
      { k: 'intro', t: 'Ask for an introduction', w: 'Introducers: well-connected people', s: 'Could you think of one or two people?', days: 6,
        b: 'Hi [First name],\n\nI’m raising a $2M round for AeroAssist and could use your help. Do you know one or two people who invest in early-stage companies, especially in hardware, public safety or defense?\n\nIf someone comes to mind, here’s a short note you can forward:\n\n"Sarvesh Joshi runs AeroAssist Industries in Phoenix. They design and build drone-as-first-responder aircraft (about 50 built, FCC certified, working with Arizona agencies) and are talking privately with investors about a $2M round. Worth a conversation: sarvesh@aeroassist.us"\n\nThank you. It means a lot.\n\nSarvesh' },
      { k: 'follow', t: 'Follow-up', w: 'No reply after about 4 days', s: 'Re: AeroAssist', days: 6,
        b: 'Hi [First name],\n\nFloating this back up in case it got buried. Happy to send the portal login or set up a quick call, whichever is easier.\n\nIf now isn’t the right time, just say so and I won’t chase.\n\nSarvesh' },
      { k: 'invite', t: 'Portal invite', w: 'Sends their one-time sign-in link', s: 'Your AeroAssist investor portal login', days: 3,
        b: 'Hi [First name],\n\nAs promised, here’s your one-time link to set up your login to our private investor portal:\n\n[Portal link]\n\nIt works once and expires in 7 days. You’ll choose a password and add an authenticator app (Google Authenticator, Microsoft Authenticator or similar); it takes about two minutes.\n\nStart with "The $2M round". It covers the terms, where the money goes, what an investment could be worth in different outcomes, and the risks, laid out plainly. The one-pager is under Documents.\n\nWhen you’ve had a look, let’s talk for 20 minutes, or come to the shop at 4750 S 44th Pl, Suite E18, Phoenix, to see the aircraft fly.' + SIG + FOOT },
      { k: 'signin', t: 'Portal reminder', w: 'They already have a login', s: 'The AeroAssist round is in your portal', days: 3,
        b: 'Hi [First name],\n\nThe details of our $2M round are now in the investor portal you already use:\n\n[Portal link]\n\nSign in as usual and open "The $2M round". It covers the terms, where the money goes, what an investment could be worth in different outcomes, and the risks, laid out plainly.\n\nHappy to walk you through it on a 20-minute call.' + SIG + FOOT },
      { k: 'maybe', t: 'Reply to a maybe', w: 'They’re interested and want to know more', s: 'Re: AeroAssist', days: 5,
        b: 'Hi [First name],\n\nThanks for being open to it. I’m sending you a one-time link to set up your login to our private investor portal; it takes two minutes.\n\nStart with "The $2M round". It covers the terms, where the money goes, what an investment could be worth in different outcomes, and the risks, laid out plainly. The one-pager is under Documents.\n\nTwo easy next steps, whichever you prefer:\n• a 20-minute call: [two or three times]\n• a visit to the shop at 4750 S 44th Pl, Suite E18, Phoenix, to see the aircraft fly\n\nWhat questions can I answer?' + SIG + FOOT },
      { k: 'yes', t: 'Reply to a yes', w: 'They want to invest', s: 'Re: AeroAssist: next steps', days: 2,
        b: 'Hi [First name],\n\nThat means a great deal. Thank you.\n\nHere’s how it works from here:\n1. We sign a mutual NDA, and I answer any diligence questions.\n2. We send the subscription documents, for you to review with your adviser.\n3. Jay Shah, our CFO, confirms your accredited-investor status and countersigns.\n4. Jay sends wiring instructions himself. Please confirm them with him by phone before you send anything; that protects you from email fraud.\n\nRoughly what amount are you thinking about? I’d like to hold an allocation for you.' + SIG + FOOT },
      { k: 'demo', t: 'Invite to the shop demo', w: 'For every Maybe and Yes', s: 'Come watch the XR-2 fly: [date]', days: 5,
        b: 'Hi [First name],\n\nWe’re opening the Phoenix shop on [day, date] at [time] for a small group: a live launch of the XR-1 and XR-2 from the dock, a look at how we build them, and 15 minutes of Q&A with me.\n\n4750 S 44th Pl, Suite E18, Phoenix, AZ 85040. It takes about an hour, and coffee’s on us.\n\nCan I count you in? Bring a guest if you’d like.\n\nSarvesh' },
      { k: 'thanks', t: 'Thank you after funding', w: 'The day their money arrives', s: 'Welcome aboard', days: 0,
        b: 'Hi [First name],\n\nYour investment arrived today. Thank you, sincerely.\n\nYou’ll see your units and documents in the investor portal, and you’ll get our monthly update by the 15th. If you ever have a question, call me directly.\n\nSarvesh' },
      { k: 'no', t: 'Reply to a no', w: 'Keep the relationship', s: 'Re: AeroAssist', days: 0,
        b: 'Hi [First name],\n\nI completely understand, and thank you for taking a look.\n\nWould you like me to add you to our occasional company updates so you can follow along? And if anyone comes to mind who might be interested, an introduction would mean a lot.\n\nSarvesh' },
      { k: 'update', t: 'Company update for a big list', w: 'Doesn’t mention the round, so it’s safe before counsel decides', s: 'What we’ve been building at AeroAssist', days: 0, warn: 'Send through an email tool with an unsubscribe link and your postal address. Don’t add anything about raising money unless counsel has confirmed Rule 506(c).',
        b: 'Hi [First name],\n\nA short update from AeroAssist Industries in Phoenix.\n\nWe design and build drone-as-first-responder aircraft. When a 911 call comes in, an aircraft launches from its dock and streams live video to responders before the first unit arrives, so they know what they’re walking into.\n\nSince 2022 we’ve built about 50 aircraft in our own shop. They’re FCC certified, CE marked and built to the NDAA supply-chain rule, and we work with agencies including Phoenix PD, Chandler PD and Arizona DOT.\n\nNext up is our hybrid gas-electric powertrain, which keeps an aircraft on scene far longer than a battery can.\n\nSee how a call runs: aeroassist.us\n\nIf you’re ever in Phoenix, reply and come watch one fly.\n\nSarvesh Joshi\nFounder & CEO, AeroAssist Industries\n4750 S 44th Pl, Suite E18, Phoenix, AZ 85040' }
    ];
    function suggest(p) {
      if (p.status === 'to_contact') return p.tier === 'Close' ? 'close' : p.tier === 'Introducer' ? 'intro' : 'pro';
      return { emailed: 'follow', maybe: 'maybe', yes: 'yes', committed: 'yes', funded: 'thanks', no: 'no' }[p.status] || 'pro';
    }
    function fill(text, p, link) { return text.replace(/\[First name\]/g, first(p.name)).replace(/\[Portal link\]/g, link || '[Portal link]'); }
    function compose(p, key, link) {
      var m = modal('Email ' + p.name), b = m.body, k = key || suggest(p);
      var g = el('div', 'ip-fg');
      var sel = fld(g, 'Template', 'tpl', 'select', k, { options: MAILS.map(function (x) { return [x.k, x.t]; }), full: true });
      var to = fld(g, 'To', 'to', 'email', p.email || '', { full: true, placeholder: 'Add their email' });
      var sj = fld(g, 'Subject', 'subj', 'text', '', { full: true });
      var bd = fld(g, 'Message', 'body', 'textarea', '', { full: true, rows: 14 });
      b.appendChild(g);
      var hint = el('p', 'ip-empty'); b.appendChild(hint);
      var mk = el('label', 'ip-check'); var mc = el('input'); mc.type = 'checkbox'; mc.checked = true; mc.id = 'rs_mark'; mk.appendChild(mc); var mt = el('span'); mk.appendChild(mt); b.appendChild(mk);
      function load2() { var t = MAILS.filter(function (x) { return x.k === sel.value; })[0]; sj.value = fill(t.s, p, link); bd.value = fill(t.b, p, link); hint.textContent = (t.warn ? t.warn + ' ' : '') + (/\[/.test(bd.value) ? 'Fill in the [bracketed] parts before sending.' : ''); mt.textContent = t.days ? 'Mark as emailed and follow up in ' + t.days + ' days' : 'Log this email'; }
      sel.onchange = load2; load2();
      var bar = el('div', 'rs-acts rs-sheetbar');
      var owner = ME || '';
      var gm = el('a', 'ip-btn pri', 'Open in Gmail'); gm.target = '_blank'; gm.rel = 'noopener';
      var ml = el('a', 'ip-btn', 'Open in mail app');
      var cp = btn('Copy message', '');
      function urls() { gm.href = 'https://mail.google.com/mail/?' + (owner ? 'authuser=' + encodeURIComponent(owner) + '&' : '') + 'view=cm&fs=1&to=' + encodeURIComponent(to.value) + '&su=' + encodeURIComponent(sj.value) + '&body=' + encodeURIComponent(bd.value); ml.href = 'mailto:' + encodeURIComponent(to.value) + '?subject=' + encodeURIComponent(sj.value) + '&body=' + encodeURIComponent(bd.value); }
      [to, sj, bd, sel].forEach(function (i) { i.addEventListener('input', urls); i.addEventListener('change', urls); }); urls();
      function sent() {
        if (!mc.checked) return; var t = MAILS.filter(function (x) { return x.k === sel.value; })[0], q = clone(byId(p.id) || p);
        if (to.value && !q.email) q.email = to.value.trim();
        if (q.status === 'to_contact') q.status = 'emailed'; q.last = today(); addLog(q, 'email', t.t);
        if (t.days && open(q)) { q.nextDate = plus(t.days); q.next = q.status === 'emailed' ? 'Follow up' : q.next || 'Follow up'; }
        save(q, 'Logged the email to ' + q.name).catch(function () {});
        mc.checked = false;
      }
      gm.addEventListener('click', sent); ml.addEventListener('click', sent); cp.onclick = function () { copy('Subject: ' + sj.value + '\n\n' + bd.value, 'Email'); sent(); };
      bar.appendChild(gm); bar.appendChild(ml); bar.appendChild(cp); bar.appendChild(btn('Close', '', m.close));
      b.appendChild(bar);
      if (p.phone) { var tx = el('p', 'ip-empty'); var sms = el('a', 'ip-linkbtn', 'Send a text: “Just sent you an email about AeroAssist.”'); sms.href = 'sms:' + p.phone.replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent('Hi ' + first(p.name) + ', just sent you an email about AeroAssist. — Sarvesh'); tx.appendChild(sms); b.appendChild(tx); }
    }
    function vMail(box) {
      var c0 = el('p', 'ip-banner info', 'Tip: you don’t need to copy these. Use the Email button on anyone in Today or Pipeline. It picks the right template, fills in their first name, opens Gmail and sets the follow-up. Until counsel confirms Rule 506(c), only send round emails one to one, to people who know you.');
      box.appendChild(c0);
      MAILS.forEach(function (t) {
        var c = el('section', 'ip-card'), h = el('h2', null, t.t); h.appendChild(el('small', null, t.w)); c.appendChild(h);
        c.appendChild(el('p', 'rs-subj', 'Subject: ' + t.s)); if (t.warn) c.appendChild(el('p', 'ip-banner info', t.warn));
        var pre = el('pre', 'rs-pre', t.b); c.appendChild(pre);
        var a = el('div', 'rs-acts'); a.appendChild(btn('Copy subject', 'sm', function () { copy(t.s, 'Subject'); })); a.appendChild(btn('Copy email', 'sm pri', function () { copy(t.b, 'Email'); })); c.appendChild(a);
        box.appendChild(c);
      });
    }

    /* ---------- REPORT ---------- */
    function vReport(box) {
      var t = totals(), wk = plus(-7), G = goal(), have = t.f + t.c;
      var moved = D.people.filter(function (p) { return (p.log || []).some(function (l) { return l.t === 'status' && l.d >= wk; }); });
      var newYes = moved.filter(function (p) { return ['yes', 'committed', 'funded'].indexOf(p.status) >= 0; });
      var emailed = D.people.filter(function (p) { return (p.log || []).some(function (l) { return l.t === 'email' && l.d >= wk; }); }).length;
      var calls = D.people.reduce(function (n, p) { return n + (p.log || []).filter(function (l) { return (l.t === 'call' || l.t === 'meeting') && l.d >= wk; }).length; }, 0);
      var lines = ['AeroAssist $2M round: week ending ' + fd(today()), '',
        'Funded: ' + money(t.f) + ' (' + t.nF + ')', 'Committed (signed): ' + money(t.c) + ' (' + t.nC + ')', 'Soft yeses: ' + money(t.s) + ' (' + t.nS + ')',
        'Total funded + committed: ' + money(have) + ' of ' + money(G) + ' (' + Math.round(have / G * 100) + '%)', '',
        'Pipeline: ' + D.people.length + ' people · ' + t.counts.maybe + ' maybe · ' + t.counts.emailed + ' waiting to hear · ' + t.counts.to_contact + ' not contacted yet · ' + t.counts.no + ' no', '',
        'This week: ' + emailed + ' people emailed · ' + calls + ' calls or meetings · ' + newYes.length + ' new yes' + (newYes.length === 1 ? '' : 'es') + (newYes.length ? ' (' + newYes.map(function (p) { return p.name + (amt(p) ? ' ' + short(amt(p)) : ''); }).join(', ') + ')' : '')];
      var c = el('section', 'ip-card'), h = el('h2', null, 'Weekly summary'); h.appendChild(el('small', null, 'For Jay or your advisers. Names included, so send it privately.')); c.appendChild(h);
      var pre = el('pre', 'rs-pre', lines.join('\n')); c.appendChild(pre);
      var a = el('div', 'rs-acts'); a.appendChild(btn('Copy summary', 'pri sm', function () { copy(lines.join('\n'), 'Summary'); })); var noNames = lines.slice(); noNames[noNames.length - 1] = noNames[noNames.length - 1].replace(/ \(.*\)$/, ''); a.appendChild(btn('Copy without names', 'sm', function () { copy(noNames.join('\n'), 'Summary'); })); c.appendChild(a);
      box.appendChild(c);
      var g = el('div', 'ip-grid ip-2'), L = el('div', 'ip-grid'), R = el('div', 'ip-grid');
      var demo = D.people.filter(function (p) { return p.demo; });
      var dc = el('section', 'ip-card'), dh = el('h2', null, 'Demo morning list'); dh.appendChild(el('small', null, demo.length + ' invited')); dc.appendChild(dh);
      if (!demo.length) dc.appendChild(el('p', 'ip-empty', 'Tick “Invite to the shop demo morning” on anyone’s card, or use the button below to add every Maybe and Yes.'));
      demo.forEach(function (p) { var r = el('div', 'rs-row'), d = el('div'); d.appendChild(nameBtn(p)); d.appendChild(el('span', 'rs-sub', [p.email, SL[p.status]].filter(Boolean).join(' · '))); r.appendChild(d); r.appendChild(btn('Email invite', 'sm', function () { compose(p, 'demo'); })); dc.appendChild(r); });
      var da = el('div', 'rs-acts');
      da.appendChild(btn('Add every Maybe and Yes', 'sm', function () { var todo = D.people.filter(function (p) { return !p.demo && ['maybe', 'yes', 'committed'].indexOf(p.status) >= 0; }); if (!todo.length) { toast('Everyone eligible is already on the list.'); return; } var i = 0; (function n() { if (i >= todo.length) { toast('Added ' + todo.length + ' to the demo list'); draw(); return; } var q = clone(todo[i++]); q.demo = true; api('PUT', '/api/raise/' + q.id, { data: q }).then(function (r) { var j = D.people.findIndex(function (x) { return x.id === q.id; }); D.people[j] = r.person; }).catch(function () {}).then(n); })(); }));
      if (demo.length) da.appendChild(btn('Copy their emails', 'sm', function () { copy(demo.map(function (p) { return p.email; }).filter(Boolean).join(', '), 'Emails'); }));
      dc.appendChild(da); L.appendChild(dc);
      var ic = {}; D.people.forEach(function (p) { if (p.introBy) { ic[p.introBy] = ic[p.introBy] || { n: 0, a: 0 }; ic[p.introBy].n++; if (['yes', 'committed', 'funded'].indexOf(p.status) >= 0) ic[p.introBy].a += amt(p); } });
      var ib = el('section', 'ip-card'), ih = el('h2', null, 'Best introducers'); ih.appendChild(el('small', null, 'Thank these people')); ib.appendChild(ih);
      var ids = Object.keys(ic).filter(byId).sort(function (a, b) { return ic[b].a - ic[a].a || ic[b].n - ic[a].n; });
      if (!ids.length) ib.appendChild(el('p', 'ip-empty', 'Set “Introduced by” on people who came through someone. The people who open doors will show up here.'));
      ids.slice(0, 10).forEach(function (id) { var p = byId(id), r = el('div', 'rs-row'), d = el('div'); d.appendChild(nameBtn(p)); d.appendChild(el('span', 'rs-sub', ic[id].n + ' introduction' + (ic[id].n > 1 ? 's' : '') + (ic[id].a ? ' · ' + short(ic[id].a) + ' in yeses' : ''))); r.appendChild(d); ib.appendChild(r); });
      R.appendChild(ib);
      var by = {}; TIERS.forEach(function (x) { by[x] = { n: 0, y: 0, a: 0 }; }); D.people.forEach(function (p) { var x = by[p.tier]; if (!x) return; x.n++; if (['yes', 'committed', 'funded'].indexOf(p.status) >= 0) { x.y++; x.a += amt(p); } });
      var tc = el('section', 'ip-card'); var th2 = el('h2', null, 'By group'); th2.appendChild(el('small', null, 'Where your money is coming from')); tc.appendChild(th2);
      var dl = el('dl', 'ip-facts'); TIERS.forEach(function (x) { dl.appendChild(el('dt', null, x + ' · ' + by[x].n + ' people')); dl.appendChild(el('dd', null, by[x].y + ' yes · ' + short(by[x].a))); }); tc.appendChild(dl); R.appendChild(tc);
      g.appendChild(L); g.appendChild(R); box.appendChild(g);
    }

    /* ---------- PLAYBOOK ---------- */
    function vPlay(box) {
      var sections = [
        ['First: how the round is offered decides who you can ask', 'warn', ['Rule 506(b): only people you already have a real relationship with, one to one. No mass emails, social posts or public pages about the round.', 'Rule 506(c): you can promote it to anyone, but every investor must be verified accredited (a CPA or lawyer letter, or a verification service).', 'Either way: Form D within 15 days of the first money in, plus state notice filings. Don’t take money before the subscription documents are final.', 'This is general information, not legal advice. Settle it with your securities lawyer.']],
        ['Who to ask, in this order', '', ['Close: family, close friends and your earlier investors.', 'Professional: clients, partners, advisers and former colleagues.', 'Introducers: well-connected people. Ask them for intros, not money.', 'List: everyone else. Only after counsel confirms 506(c).', 'Build 150–200 names. Most will say no or not now. That’s normal.']],
        ['Every morning (15 minutes)', '', ['Open Today. Clear “Follow up today” first.', 'Call anyone under “Reading the round right now”, while it’s fresh.', 'Send 10–15 first emails from “Next to contact”, Hot first, and text each person.', 'Fix the Loose ends.']],
        ['From maybe to money', '', ['Call, or a shop visit.', 'Invite to the portal from their card. The tracker makes the login and the email.', 'Soft yes: record the amount. Then the NDA.', 'Subscription documents from counsel. Committed when signed.', 'Funded when the money lands. Wire details come only from Jay, confirmed by phone.']],
        ['Every Friday', '', ['Copy the weekly summary from Report and send it to Jay.', 'Look at the funnel. If few people move from Emailed to Maybe, fix the first email. If Maybes stall, push the demo morning.', 'Thank your best introducers.']],
        ['Never say', '', ['“No risk”, “guaranteed”, “you’ll double your money”, or any promised return or buyback.', 'Don’t send the draft subscription agreement; counsel finalises it first.', 'Don’t take money before documents are signed.']]
      ];
      var g = el('div', 'rs-play');
      sections.forEach(function (s) { var c = el('section', 'ip-card' + (s[1] ? ' rs-warn' : '')); c.appendChild(el('h2', null, s[0])); var ul = el('ul', 'rs-ul'); s[2].forEach(function (x) { ul.appendChild(el('li', null, x)); }); c.appendChild(ul); g.appendChild(c); });
      box.appendChild(g);
    }

    return {
      raise: {
        title: ['Raise tracker', 'The $2M round · only you can see this'],
        render: function (box, act, m) { ME = (m && m.holder && m.holder.email) || ''; render(box, act); }
      }
    };
  };
})();
