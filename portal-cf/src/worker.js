// AeroAssist investor and team portal: Cloudflare Worker.
// Accounts, two-factor and sessions live in D1; documents are encrypted (AES-256-GCM) in R2.
// Nothing here depends on WordPress or any outside sign-in service.
import {
  b64url, randomBytes, uuid, sha256hex, safeEqual, encrypt, decrypt, encryptText, decryptText,
  hashPassword, verifyPassword, verifyTotp, newTotpSecret, newRecoveryCodes, normRecovery, zip, keyedHash,
} from './lib.js';

const ROLES = ['prospect', 'investor', 'employee', 'admin'];
const GROUPS = {
  company: ['prospect', 'investor', 'employee', 'admin'],
  investors: ['prospect', 'investor', 'admin'],
  holders: ['investor', 'admin'],
  team: ['employee', 'admin'],
  admin: ['admin'],
};
const PCATS = ['tax', 'certificates', 'agreements', 'updates', 'team', 'other'];
const TYPES = {
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};
const MAGIC = { pdf: '%PDF', png: '\x89PNG', jpg: '\xFF\xD8\xFF', jpeg: '\xFF\xD8\xFF', xlsx: 'PK\x03\x04', docx: 'PK\x03\x04', pptx: 'PK\x03\x04', xls: '\xD0\xCF\x11\xE0', doc: '\xD0\xCF\x11\xE0' };
const MAX_FILE = 25 * 1024 * 1024;
const SESSION_MAX = 12 * 3600;          // seconds
const PRE_2FA_MAX = 10 * 60;            // a half-finished sign-in expires after 10 minutes
const LINK_DAYS = 7;

const now = () => Math.floor(Date.now() / 1000);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

/* ---------------------------------------------------------------- settings */

const DEFAULT_SETTINGS = {
  as_of: '', units_outstanding: 10000, round_units: 1000, round_name: 'the current round', unit_price: 0, price_label: '',
  price_history: [], announcements: [], tax_note: '', company_facts: [], note: '',
  about: 'AeroAssist Industries designs, fabricates and builds drone-as-first-responder aircraft in Phoenix, Arizona, for police, fire and rescue agencies.',
  contacts: [['Jay Shah', 'Chief Financial Officer', 'Tax documents, statements, access and transfers', 'jay@aeroassist.us'], ['Sarvesh Joshi', 'Founder and CEO', 'The business, the round and everything else', 'sarvesh@aeroassist.us']],
  links: [['Company website', 'https://aeroassist.us/'], ['The $2M round (investor relations)', 'https://aeroassist.us/invest/']],
  address: 'AeroAssist Industries · 4750 S 44th Pl, Suite E18, Phoenix, AZ 85040',
  help_email: 'jay@aeroassist.us', idle_minutes: 30,
  // The round, as prospective investors see it under "The opportunity". All of it is editable in Settings.
  offer_on: true,
  offer_title: 'The $2M round',
  offer_raise: 2000000, offer_pre: 20000000,
  offer_security: 'LLC membership units in AeroAssist Industries',
  offer_min: '',
  offer_lead: 'AeroAssist is raising $2,000,000 to finish its hybrid powertrain, ready the XR-2 for production and put more stations in front of agencies that now have to buy US-built, compliant aircraft.',
  offer_highlights: [
    ['Built, not bought', 'About 50 aircraft designed, fabricated and assembled in our Phoenix shop since 2022. FCC certified and CE marked, built to NDAA §848.'],
    ['Agencies already fly them', 'Arizona DOT, Phoenix PD, Chandler PD, Prescott PD and Fire, the Mountain Rescue Association and Alpine Rescue Team. Working relationships, not endorsements.'],
    ['The market just opened', 'More than 1,000 agencies received FAA DFR waivers between April 2025 and February 2026, more than the seven years before. Since December 22, 2025, federal money can’t buy drones from covered foreign makers.'],
    ['Lean by habit', 'All of this on about $600,000 of outside capital, all of it repaid. No debt. Peers raised $5M to $672M to get to a similar place.'],
  ],
  offer_track: [
    ['$600K', 'raised from outside investors in 2023, at a $4M valuation'],
    ['100%', 'of that money paid back by April 2024, and those investors still hold their units'],
    ['$400 → $2,000', 'price per unit in 2023 and in this round'],
  ],
  offer_use: [
    ['Hybrid powertrain and XR-2 production readiness', '550000'], ['Manufacturing scale-up', '400000'], ['Marketing and sales', '250000'],
    ['Agency deployments', '250000'], ['Team', '200000'], ['Phase 1 validation', '200000'], ['Regulatory, legal and contingency', '150000'],
  ],
  offer_phases: [
    ['Phase 1', '200000', 'Days 0–90', 'Logged flight tests, agency test criteria and one or two paid evaluations: proof of the pilot path.'],
    ['Phase 2', '1800000', 'Months 4–18', 'Finish the hybrid, ready XR-2 for production, scale manufacturing and deploy stations.'],
  ],
  offer_comps: [
    ['Aerodome', 'Acquired by Flock Safety, 2024, 17 months after founding', 'Reported $300M+'],
    ['BRINC', 'Round led by Motorola Solutions, 2026', '$125M raised'],
    ['Skydio', 'Series F, 2026', '$4.4B valuation'],
  ],
  offer_risks: [
    ['You could lose all of it', 'This is an early-stage hardware company. Most startups never return their investors’ money.'],
    ['You can’t easily sell', 'There is no market for LLC units. Expect to hold them until a sale of the company or distributions, which may never happen.'],
    ['The hybrid isn’t finished', 'It is the largest use of funds and could take longer or cost more than planned.'],
    ['Agencies buy slowly', 'Public budgets and grant cycles can stretch a sale over many months.'],
    ['Big, well-funded rivals', 'Skydio, BRINC and Flock have raised hundreds of millions of dollars.'],
    ['Rules can change', 'FAA, FCC and federal-funding rules shape what agencies can buy, including rules on components sourced abroad.'],
    ['More dilution later', 'Future rounds would reduce your percentage of the company.'],
    ['A small team', 'The company depends on a few key people.'],
  ],
  offer_steps: [
    ['Read the materials', 'The one-pager, subscription agreement and operating agreement summary are under Documents.'],
    ['Talk to Sarvesh', 'A 30-minute call, or a visit to the Phoenix shop to see the aircraft fly.'],
    ['Do your diligence', 'Sign the mutual NDA for build records, customer references and financials.'],
    ['Subscribe', 'Review the subscription agreement with your adviser. The CFO confirms your eligibility and countersigns.'],
  ],
  offer_email: 'sarvesh@aeroassist.us',
  offer_exits: [50000000, 100000000, 250000000, 500000000],
  offer_dilution: 30,
  offer_note: 'For discussion with prospective investors only. Not an offer to sell or a solicitation of an offer to buy securities; any offer is made only through the subscription documents. Company figures are company-reported and unaudited.',
};
async function getSettings(env) {
  const r = await env.DB.prepare('SELECT data FROM settings WHERE id = 1').first();
  let d = {};
  try { d = JSON.parse(r ? r.data : '{}'); } catch (e) { d = {}; }
  return { ...DEFAULT_SETTINGS, ...d };
}
const str = (v, max = 500) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const rows = (v, cols) => (Array.isArray(v) ? v : []).filter(Array.isArray).slice(0, 50).map(r => Array.from({ length: cols }, (_, i) => str(r[i])));
function cleanSettings(d) {
  const s = {
    as_of: date(d.as_of), units_outstanding: Math.max(1, num(d.units_outstanding, 10000)), round_units: Math.max(0, num(d.round_units)),
    round_name: str(d.round_name, 120), unit_price: Math.max(0, num(d.unit_price)), price_label: str(d.price_label),
    price_history: (Array.isArray(d.price_history) ? d.price_history : []).slice(0, 50).filter(p => p && date(p.date) && Number.isFinite(+p.price)).map(p => ({ date: date(p.date), price: +p.price, label: str(p.label, 120) })),
    announcements: (Array.isArray(d.announcements) ? d.announcements : []).slice(0, 30).filter(a => a && (a.title || a.body)).map(a => ({ date: date(a.date), title: str(a.title, 200), body: str(a.body, 2000) })),
    tax_note: str(d.tax_note), company_facts: rows(d.company_facts, 2), note: str(d.note), about: str(d.about, 3000),
    contacts: rows(d.contacts, 4), links: rows(d.links, 2).filter(l => /^https:\/\/[^/]/.test(l[1]) || /^\/(?!\/)/.test(l[1])),
    address: str(d.address), help_email: str(d.help_email, 200), idle_minutes: Math.min(240, Math.max(5, Math.round(num(d.idle_minutes, 30)))),
    offer_on: d.offer_on !== false && d.offer_on !== 'false',
    offer_title: str(d.offer_title, 80) || DEFAULT_SETTINGS.offer_title,
    offer_raise: Math.max(0, num(d.offer_raise, DEFAULT_SETTINGS.offer_raise)), offer_pre: Math.max(0, num(d.offer_pre, DEFAULT_SETTINGS.offer_pre)),
    offer_security: str(d.offer_security, 200), offer_min: str(d.offer_min, 120), offer_lead: str(d.offer_lead, 1500),
    offer_highlights: rows(d.offer_highlights, 2), offer_track: rows(d.offer_track, 2), offer_use: rows(d.offer_use, 2),
    offer_phases: rows(d.offer_phases, 4), offer_comps: rows(d.offer_comps, 3), offer_risks: rows(d.offer_risks, 2), offer_steps: rows(d.offer_steps, 2),
    offer_email: str(d.offer_email, 200),
    offer_exits: (Array.isArray(d.offer_exits) ? d.offer_exits : []).map(Number).filter(v => Number.isFinite(v) && v > 0).slice(0, 6),
    offer_dilution: Math.min(80, Math.max(0, num(d.offer_dilution, 30))),
    offer_note: str(d.offer_note, 1500),
  };
  return s;
}

/* ---------------------------------------------------------------- sessions */

function cookieName(env) { return env.COOKIE_NAME || '__Host-aap'; }
function readCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1); }
  return '';
}
function setCookie(env, value, maxAge) {
  return `${cookieName(env)}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
async function newSession(ctx, userId, stage, viaLink = false) {
  const raw = b64url(randomBytes(32));
  const t = now();
  await ctx.env.DB.prepare('INSERT INTO sessions (id_hash, user_id, stage, via_link, created_at, last_seen, ip, ua) VALUES (?,?,?,?,?,?,?,?)')
    .bind(await sha256hex(raw), userId, stage, viaLink ? 1 : 0, t, t, ctx.ip, ctx.ua).run();
  ctx.setCookie = setCookie(ctx.env, raw, SESSION_MAX);
  return raw;
}
async function endSession(ctx) {
  if (ctx.sessionHash) await ctx.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(ctx.sessionHash).run();
  ctx.setCookie = setCookie(ctx.env, '', 0);
}
/** Load the session and user. Applies the 12-hour limit and the idle timeout. */
async function loadSession(ctx) {
  const raw = readCookie(ctx.req, cookieName(ctx.env));
  if (!raw || raw.length > 100) return null;
  const h = await sha256hex(raw);
  const s = await ctx.env.DB.prepare('SELECT * FROM sessions WHERE id_hash = ?').bind(h).first();
  if (!s) return null;
  ctx.sessionHash = h;
  const t = now();
  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first();
  const settings = await getSettings(ctx.env);
  const idle = settings.idle_minutes * 60;
  const expired = t - s.created_at > SESSION_MAX || (s.stage !== 'ok' && t - s.created_at > PRE_2FA_MAX);
  const idled = s.stage === 'ok' && t - s.last_seen > idle;
  if (!user || !user.active || expired || idled) {
    if (idled && user) await log(ctx, 'timeout', null, '', user.id);
    await endSession(ctx);
    return null;
  }
  if (t - s.last_seen >= 30) await ctx.env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').bind(t, h).run();
  ctx.session = s; ctx.user = user; ctx.settings = settings;
  return s;
}
async function requireStage(ctx, stage) {
  const s = await loadSession(ctx);
  if (!s) fail(401, 'Please sign in.');
  if (s.stage !== stage) fail(403, stage === 'ok' ? 'Finish signing in with your authenticator code.' : 'This step is not available now.');
}
async function requireMember(ctx) {
  await requireStage(ctx, 'ok');
  if (!ROLES.includes(ctx.user.role)) fail(403, 'Your account does not have portal access yet.');
}
async function requireAdmin(ctx) {
  await requireMember(ctx);
  if (ctx.user.role !== 'admin') fail(403, 'Administrators only.');
}

/* ---------------------------------------------------------------- activity log and throttling */

async function log(ctx, action, docId, detail = '', userId) {
  await ctx.env.DB.prepare('INSERT INTO activity (user_id, doc_id, action, detail, ip, ua, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(userId !== undefined ? userId : ctx.user ? ctx.user.id : null, docId || null, action, str(detail, 250), ctx.ip, ctx.ua.slice(0, 250), now()).run();
}
/** At most `limit` attempts per `windowSec` for this key (one atomic statement, so parallel requests can't slip through). */
async function throttle(ctx, key, limit, windowSec) {
  const t = now();
  const r = await ctx.env.DB.prepare(
    `INSERT INTO throttle (key, count, window) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ?2 - window > ?3 THEN 1 ELSE count + 1 END,
       window = CASE WHEN ?2 - window > ?3 THEN ?2 ELSE window END
     RETURNING count`).bind(key, t, windowSec).first();
  if (!r || r.count > limit) fail(429, 'Too many attempts. Please wait a few minutes and try again.');
}
/** Count one try on this session; false once the session has used up `limit`. */
async function sessionTry(ctx, limit) {
  const r = await ctx.env.DB.prepare('UPDATE sessions SET tries = tries + 1 WHERE id_hash = ? AND tries < ? RETURNING tries').bind(ctx.sessionHash, limit).first();
  return !!r;
}
const recoveryHash = (env, code) => keyedHash(env, 'recovery', normRecovery(code));

/* ---------------------------------------------------------------- permissions */

function canView(user, doc) {
  if (!user || !ROLES.includes(user.role) || !doc) return false;
  if (doc.grp === 'personal') return doc.user_id === user.id || user.role === 'admin';
  return (GROUPS[doc.grp] || []).includes(user.role);
}
function groupsFor(role) { return Object.keys(GROUPS).filter(g => GROUPS[g].includes(role)); }

/* ---------------------------------------------------------------- people helpers */

async function nextPortalId(env) {
  const r = await env.DB.prepare("SELECT portal_id FROM users WHERE portal_id LIKE 'AA-%'").all();
  let max = 0;
  for (const x of r.results) { const m = /^AA-(\d+)$/.exec(x.portal_id); if (m) max = Math.max(max, +m[1]); }
  return 'AA-' + String(max + 1).padStart(4, '0');
}
async function makeLink(ctx, userId) {
  const token = b64url(randomBytes(24)), t = now();
  await ctx.env.DB.prepare('UPDATE links SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(t, userId).run();
  await ctx.env.DB.prepare('INSERT INTO links (token_hash, user_id, expires_at, created_by, created_at) VALUES (?,?,?,?,?)')
    .bind(await sha256hex(token), userId, t + LINK_DAYS * 86400, ctx.user ? ctx.user.id : null, t).run();
  return { url: new URL('/#setup=' + token, ctx.url.origin).href, expires_at: t + LINK_DAYS * 86400 };
}
function publicPerson(u, extra = {}) {
  return {
    id: u.id, email: u.email, name: u.name, portal_id: u.portal_id, role: u.role, active: !!u.active, units: u.units, since: u.since || '',
    invested: u.invested, title: u.title, has_password: !!u.pw_hash, twofa: !!u.totp_secret, last_signin: u.last_signin || null,
    recovery_left: (() => { try { return JSON.parse(u.recovery || '[]').length; } catch (e) { return 0; } })(), ...extra,
  };
}
function cleanEmail(e) {
  e = String(e || '').trim().toLowerCase();
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(e) || e.length > 200) fail(400, 'That email address does not look right.');
  return e;
}
function checkPassword(pw, email) {
  pw = String(pw || '');
  if (pw.length < 12) fail(400, 'Use at least 12 characters.');
  if (pw.length > 200) fail(400, 'That password is too long.');
  if (pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) fail(400, 'Don’t include your email name in the password.');
  if (/^(.)\1+$/.test(pw) || /^(password|123456|qwerty)/i.test(pw)) fail(400, 'Choose a less predictable password.');
  return pw;
}

/* ---------------------------------------------------------------- files */

function checkFile(name, bytes) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (!TYPES[ext]) fail(400, 'That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text or an image.');
  if (bytes.length > MAX_FILE) fail(400, 'Files can be at most 25 MB.');
  if (MAGIC[ext]) {
    const m = MAGIC[ext];
    for (let i = 0; i < m.length; i++) if (bytes[i] !== m.charCodeAt(i)) fail(400, 'The file contents do not match its name.');
  } else {
    const head = new TextDecoder().decode(bytes.subarray(0, 65536));
    if (/<\?php|<script|<html|\u0000/i.test(head)) fail(400, 'The file contents do not match its name.');
  }
  return { ext, mime: TYPES[ext] };
}
function safeName(n) { return str(n, 180).replace(/[\\/:*?"<>|]+/g, '_') || 'document'; }
async function storeFile(ctx, name, bytes) {
  const { mime } = checkFile(name, bytes);
  const key = 'f/' + b64url(randomBytes(18));
  await ctx.env.FILES.put(key, await encrypt(ctx.env, bytes, 'file:' + key));
  return { r2_key: key, mime, size: bytes.length, sha256: await sha256hex(bytes) };
}
async function readFile(env, key) {
  const o = await env.FILES.get(key);
  if (!o) return null;
  return decrypt(env, await o.arrayBuffer(), 'file:' + key);
}
function disposition(type, name) {
  const ascii = name.replace(/[^A-Za-z0-9._-]+/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/* ---------------------------------------------------------------- portal data for the signed-in person */

function docOut(d, mine) {
  return {
    id: d.id, title: d.title, date: d.doc_date || '', size: d.size, type: d.mime, name: d.file_name,
    cat: mine ? d.category : (d.category || 'Documents'), desc: d.description || '', group: mine ? '' : d.grp,
    url: '/api/file/' + d.id, view: '/api/file/' + d.id + '?mode=view',
  };
}
async function portalData(ctx) {
  const { env, user } = ctx, s = ctx.settings;
  const mine = (await env.DB.prepare("SELECT * FROM documents WHERE grp = 'personal' AND user_id = ? ORDER BY doc_date DESC, id DESC").bind(user.id).all()).results;
  const g = groupsFor(user.role);
  const lib = (await env.DB.prepare(`SELECT * FROM documents WHERE grp IN (${g.map(() => '?').join(',')}) ORDER BY doc_date DESC, id DESC`).bind(...g).all()).results;
  const tx = (await env.DB.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC').bind(user.id).all()).results;
  const out = {
    id: user.portal_id, role: user.role,
    holder: { name: user.name, email: user.email, units: user.units, since: user.since || '', invested: user.invested, title: user.title },
    unitsOutstanding: s.units_outstanding, roundUnits: s.round_units, roundName: s.round_name, unitPrice: s.unit_price, priceLabel: s.price_label,
    priceHistory: s.price_history, announcements: s.announcements, taxNote: s.tax_note, company: s.company_facts, about: s.about,
    contacts: s.contacts, links: s.links, address: s.address, asOf: s.as_of, note: s.note, idleMinutes: s.idle_minutes,
    twofa: 'Authenticator app', recoveryLeft: publicPerson(user).recovery_left,
    docs: mine.map(d => docOut(d, true)), lib: lib.map(d => docOut(d, false)),
    transactions: tx.map(t => ({ date: t.tx_date || '', type: t.type, units: t.units, amount: t.amount, note: t.note })),
    urls: { zip: '/api/zip', vendor: '/vendor/', home: 'https://aeroassist.us/' },
  };
  if (s.offer_on && ['prospect', 'investor', 'admin'].includes(user.role)) {
    out.offer = {
      title: s.offer_title, raise: s.offer_raise, pre: s.offer_pre, security: s.offer_security, min: s.offer_min, lead: s.offer_lead,
      highlights: s.offer_highlights, track: s.offer_track, use: s.offer_use, phases: s.offer_phases, comps: s.offer_comps,
      risks: s.offer_risks, steps: s.offer_steps, email: s.offer_email, exits: s.offer_exits, dilution: s.offer_dilution, note: s.offer_note,
    };
  }
  if (user.role === 'admin') {
    const people = (await env.DB.prepare('SELECT * FROM users ORDER BY name').all()).results;
    out.roster = people.filter(p => ROLES.includes(p.role) && p.active).map(p => ({
      id: p.portal_id, uid: p.id, name: p.name, role: p.role, units: p.units, invested: p.invested,
      twofa: p.totp_secret ? 'Authenticator app' : (p.pw_hash ? 'Not set up yet' : 'Invited'),
      last: p.last_signin ? new Date(p.last_signin * 1000).toISOString().slice(0, 10) : '',
    }));
    out.activity = await activityRows(env, { limit: 12, types: ['view', 'download', 'zip', 'signin', 'signin_failed', 'denied'] });
  }
  return out;
}
async function activityRows(env, q) {
  const where = [], args = [];
  if (q.user) { where.push('a.user_id = ?'); args.push(q.user); }
  if (q.types) { where.push(`a.action IN (${q.types.map(() => '?').join(',')})`); args.push(...q.types); }
  if (q.from) { where.push('a.created_at >= ?'); args.push(q.from); }
  if (q.to) { where.push('a.created_at <= ?'); args.push(q.to); }
  args.push(Math.min(5000, Math.max(1, q.limit || 200)));
  const r = await env.DB.prepare(`SELECT a.*, u.name AS who, u.portal_id, d.title AS doc_title FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN documents d ON d.id = a.doc_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`).bind(...args).all();
  return r.results.map(a => ({ id: a.id, when: a.created_at, who: a.who || 'Unknown', portal_id: a.portal_id || '', user_id: a.user_id, action: a.action, doc: a.doc_title || '', doc_id: a.doc_id, detail: a.detail, ip: a.ip, ua: a.ua }));
}

/* ---------------------------------------------------------------- routes */

async function body(ctx) {
  try { return await ctx.req.json(); } catch (e) { fail(400, 'Bad request.'); }
}

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

// ----- first administrator (only while there are no accounts, and only with BOOTSTRAP_CODE)
route('GET', '/api/bootstrap', async ctx => {
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  return json({ needed: n.n === 0 && !!ctx.env.BOOTSTRAP_CODE });
});
route('POST', '/api/bootstrap', async ctx => {
  await throttle(ctx, 'boot:' + ctx.ip, 5, 900);
  const b = await body(ctx);
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if (n.n !== 0 || !ctx.env.BOOTSTRAP_CODE || !safeEqual(String(b.code || ''), ctx.env.BOOTSTRAP_CODE)) fail(403, 'Setup is not available.');
  const id = uuid(), email = cleanEmail(b.email);
  await ctx.env.DB.prepare('INSERT INTO users (id, email, name, portal_id, role, created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, email, str(b.name, 120) || email, 'AA-0001', 'admin', now()).run();
  await log(ctx, 'person_add', null, 'first administrator', id);
  return json({ link: (await makeLink(ctx, id)).url });
});

// ----- one-time sign-up / new-password link
route('POST', '/api/link/check', async ctx => {
  await throttle(ctx, 'link:' + ctx.ip, 30, 900);
  const b = await body(ctx);
  const l = await ctx.env.DB.prepare('SELECT l.*, u.name, u.email, u.active FROM links l JOIN users u ON u.id = l.user_id WHERE l.token_hash = ?').bind(await sha256hex(String(b.token || ''))).first();
  if (!l || l.used_at || l.expires_at < now() || !l.active) fail(400, 'This link has expired or was already used. Ask for a new one.');
  return json({ name: l.name, email: l.email });
});
route('POST', '/api/link/use', async ctx => {
  await throttle(ctx, 'link:' + ctx.ip, 30, 900);
  const b = await body(ctx);
  const th = await sha256hex(String(b.token || ''));
  const l = await ctx.env.DB.prepare('SELECT * FROM links WHERE token_hash = ?').bind(th).first();
  const u = l && await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(l.user_id).first();
  if (!l || l.used_at || l.expires_at < now() || !u || !u.active) fail(400, 'This link has expired or was already used. Ask for a new one.');
  const pw = checkPassword(b.password, u.email);
  const h = await hashPassword(ctx.env, pw);
  const res = await ctx.env.DB.prepare('UPDATE links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(now(), th).run();
  if (!res.meta.changes) fail(400, 'This link was already used.');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ? WHERE id = ?').bind(h.hash, h.salt, h.iter, u.id),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
  ]);
  await log(ctx, 'password_set', null, '', u.id);
  // Only a session that came from a one-time link may set up an authenticator.
  const stage = u.totp_secret ? 'code' : 'enroll';
  await newSession(ctx, u.id, stage, stage === 'enroll');
  return json({ stage });
});

// ----- sign in
route('POST', '/api/login', async ctx => {
  await throttle(ctx, 'login:' + ctx.ip, 20, 900);
  const b = await body(ctx);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const eh = await sha256hex(email);
  // The same limits apply to every email, existing or not, so responses say nothing about who has an account.
  await throttle(ctx, 'pw:' + eh + ':' + ctx.ip, 8, 900);
  await throttle(ctx, 'pwu:' + eh, 40, 3600);
  const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const good = await verifyPassword(ctx.env, String(b.password || ''), u && u.active ? u : null);
  if (!good) {
    if (u) await log(ctx, 'signin_failed', null, 'wrong password', u.id);
    fail(401, 'That email and password don’t match.');
  }
  if (!u.totp_secret) fail(403, 'Your sign-in isn’t finished yet. Use the sign-in link you were sent, or ask the CFO for a new one.');
  await newSession(ctx, u.id, 'code');
  return json({ stage: 'code' });
});
route('POST', '/api/code', async ctx => {
  await requireStage(ctx, 'code');
  const b = await body(ctx), u = ctx.user;
  if (!(await sessionTry(ctx, 5))) { await log(ctx, 'signin_failed', null, 'too many wrong codes'); await endSession(ctx); fail(429, 'Too many wrong codes. Sign in again.'); }
  // At most 10 code attempts per person per hour, across all sessions and addresses.
  try { await throttle(ctx, 'code:' + u.id, 10, 3600); } catch (e) { await log(ctx, 'signin_failed', null, 'code attempts paused for an hour'); await endSession(ctx); throw e; }
  let ok = false, used = '';
  const code = String(b.code || '');
  if (/^\s*\d{3}\s*\d{3}\s*$/.test(code)) {
    const step = await verifyTotp(await decryptText(ctx.env, u.totp_secret, 'totp:' + u.id), code, u.totp_last);
    if (step) {
      const r = await ctx.env.DB.prepare('UPDATE users SET totp_last = ? WHERE id = ? AND totp_last < ?').bind(step, u.id, step).run();
      ok = r.meta.changes === 1;
    }
  } else if (normRecovery(code).length === 8) {
    const h = await recoveryHash(ctx.env, code);
    const list = JSON.parse(u.recovery || '[]');
    if (list.includes(h)) {
      const left = list.filter(x => x !== h);
      const r = await ctx.env.DB.prepare('UPDATE users SET recovery = ? WHERE id = ? AND recovery = ?').bind(JSON.stringify(left), u.id, u.recovery).run();
      ok = r.meta.changes === 1; used = 'recovery code used, ' + left.length + ' left';
    }
  }
  if (!ok) { await log(ctx, 'signin_failed', null, 'wrong code'); fail(401, 'That code didn’t work. Check the time on your phone and try the newest code.'); }
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(ctx.sessionHash),
    ctx.env.DB.prepare('DELETE FROM throttle WHERE key = ?').bind('code:' + u.id),
    ctx.env.DB.prepare('UPDATE users SET last_signin = ? WHERE id = ?').bind(now(), u.id),
  ]);
  await newSession(ctx, u.id, 'ok');      // new session id once fully signed in
  await log(ctx, 'signin', null, used);
  return json({ stage: 'ok' });
});
function requireEnrollment(ctx) {
  if (!ctx.session.via_link || ctx.user.totp_secret) fail(403, 'Use the sign-in link you were sent to set up your authenticator.');
}
route('GET', '/api/enroll', async ctx => {
  await requireStage(ctx, 'enroll');
  requireEnrollment(ctx);
  const secret = newTotpSecret();
  await ctx.env.DB.prepare('UPDATE sessions SET pending = ? WHERE id_hash = ?').bind(await encryptText(ctx.env, secret, 'pending:' + ctx.sessionHash), ctx.sessionHash).run();
  const label = encodeURIComponent('AeroAssist:' + ctx.user.email);
  return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=AeroAssist&algorithm=SHA1&digits=6&period=30` });
});
route('POST', '/api/enroll', async ctx => {
  await requireStage(ctx, 'enroll');
  requireEnrollment(ctx);
  const b = await body(ctx), u = ctx.user;
  if (!ctx.session.pending) fail(400, 'Start again: reload the page.');
  if (!(await sessionTry(ctx, 8))) { await endSession(ctx); fail(429, 'Too many wrong codes. Use your sign-in link again.'); }
  const secret = await decryptText(ctx.env, ctx.session.pending, 'pending:' + ctx.sessionHash);
  const step = await verifyTotp(secret, b.code, 0);
  if (!step) fail(401, 'That code didn’t work. Make sure your phone’s time is set automatically, then try the newest code.');
  const codes = newRecoveryCodes();
  const hashes = await Promise.all(codes.map(c => recoveryHash(ctx.env, c)));
  const r = await ctx.env.DB.prepare('UPDATE users SET totp_secret = ?, totp_last = ?, recovery = ?, last_signin = ? WHERE id = ? AND totp_secret IS NULL')
    .bind(await encryptText(ctx.env, secret, 'totp:' + u.id), step, JSON.stringify(hashes), now(), u.id).run();
  if (!r.meta.changes) fail(409, 'An authenticator is already set up for this account.');
  await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
  await newSession(ctx, u.id, 'ok');
  await log(ctx, 'twofa_setup', null, '');
  await log(ctx, 'signin', null, '');
  return json({ stage: 'ok', recovery: codes });
});
route('POST', '/api/logout', async ctx => {
  if (await loadSession(ctx)) await log(ctx, 'signout');
  await endSession(ctx);
  return json({ ok: true });
});
route('GET', '/api/me', async ctx => {
  const s = await loadSession(ctx);
  if (!s) return json({ stage: 'signed_out' });
  const u = ctx.user;
  return json({ stage: s.stage, name: u.name, email: u.email, role: ROLES.includes(u.role) ? u.role : null, idleMinutes: ctx.settings.idle_minutes, helpEmail: ctx.settings.help_email });
});
route('POST', '/api/ping', async ctx => { await requireStage(ctx, 'ok'); return json({ ok: true }); });

// ----- the portal itself
route('GET', '/api/portal', async ctx => { await requireMember(ctx); return json(await portalData(ctx)); });
route('GET', '/api/file/:id', async (ctx, p) => {
  await requireMember(ctx);
  const d = await ctx.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(+p.id || 0).first();
  if (!d || !canView(ctx.user, d)) { await log(ctx, 'denied', +p.id || null, 'not allowed'); fail(404, 'That document is not available to you.'); }
  const data = await readFile(ctx.env, d.r2_key);
  if (!data) { await log(ctx, 'error', d.id, 'file missing'); fail(500, 'This document could not be opened. Please let the CFO know.'); }
  const inline = ctx.url.searchParams.get('mode') === 'view' && ['application/pdf', 'image/png', 'image/jpeg'].includes(d.mime);
  await log(ctx, inline ? 'view' : 'download', d.id, d.grp === 'personal' && d.user_id !== ctx.user.id ? 'admin access to a personal document' : '');
  return new Response(data, { headers: { 'content-type': d.mime, 'content-disposition': disposition(inline ? 'inline' : 'attachment', d.file_name || 'document'), 'cache-control': 'private, no-store' } });
});
route('GET', '/api/zip', async ctx => {
  await requireMember(ctx);
  const mine = (await ctx.env.DB.prepare("SELECT * FROM documents WHERE grp = 'personal' AND user_id = ? ORDER BY doc_date DESC").bind(ctx.user.id).all()).results;
  if (!mine.length) fail(404, 'You have no personal documents yet.');
  if (mine.reduce((t, d) => t + d.size, 0) > 40 * 1024 * 1024) fail(413, 'Your documents are too large to zip together. Download them one at a time.');
  const files = [], used = new Set();
  for (const d of mine) {
    const data = await readFile(ctx.env, d.r2_key); if (!data) continue;
    let n = safeName(d.file_name || d.title); while (used.has(n)) n = '1_' + n; used.add(n);
    files.push({ name: n, data }); await log(ctx, 'zip', d.id);
  }
  return new Response(zip(files), { headers: { 'content-type': 'application/zip', 'content-disposition': disposition('attachment', 'AeroAssist_My_Documents.zip'), 'cache-control': 'private, no-store' } });
});
route('POST', '/api/password', async ctx => {
  await requireStage(ctx, 'ok');
  await throttle(ctx, 'pw:' + ctx.user.id, 10, 900);
  const b = await body(ctx);
  if (!(await verifyPassword(ctx.env, String(b.current || ''), ctx.user))) fail(401, 'Your current password is not right.');
  const h = await hashPassword(ctx.env, checkPassword(b.password, ctx.user.email));
  await ctx.env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ? WHERE id = ?').bind(h.hash, h.salt, h.iter, ctx.user.id).run();
  await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?').bind(ctx.user.id, ctx.sessionHash).run();
  await log(ctx, 'password_change');
  return json({ ok: true });
});
route('POST', '/api/recovery', async ctx => {
  await requireStage(ctx, 'ok');
  await throttle(ctx, 'rc:' + ctx.user.id, 10, 900);
  const b = await body(ctx), u = ctx.user;
  const step = await verifyTotp(await decryptText(ctx.env, u.totp_secret, 'totp:' + u.id), b.code, u.totp_last);
  if (!step) fail(401, 'That code didn’t work.');
  const codes = newRecoveryCodes();
  await ctx.env.DB.prepare('UPDATE users SET recovery = ?, totp_last = ? WHERE id = ? AND totp_last < ?').bind(JSON.stringify(await Promise.all(codes.map(c => recoveryHash(ctx.env, c)))), step, u.id, step).run();
  await log(ctx, 'recovery_codes');
  return json({ recovery: codes });
});

// ----- administrators
route('GET', '/api/admin/people', async ctx => {
  await requireAdmin(ctx);
  const people = (await ctx.env.DB.prepare('SELECT * FROM users ORDER BY name').all()).results;
  const links = (await ctx.env.DB.prepare('SELECT user_id, MAX(expires_at) AS exp FROM links WHERE used_at IS NULL AND expires_at > ? GROUP BY user_id').bind(now()).all()).results;
  const linkBy = Object.fromEntries(links.map(l => [l.user_id, l.exp]));
  return json(people.map(p => publicPerson(p, { link_expires: linkBy[p.id] || null })));
});
route('POST', '/api/admin/people', async ctx => {
  await requireAdmin(ctx);
  const b = await body(ctx), email = cleanEmail(b.email);
  if (b.role && !ROLES.includes(b.role)) fail(400, 'Unknown role.');
  if (await ctx.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) fail(409, 'Someone with that email already has a sign-in.');
  const id = uuid(), pid = await nextPortalId(ctx.env);
  await ctx.env.DB.prepare('INSERT INTO users (id, email, name, portal_id, role, units, since, invested, title, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, email, str(b.name, 120) || email, pid, b.role || null, num(b.units), date(b.since) || null, num(b.invested), str(b.title, 120), now()).run();
  await log(ctx, 'person_add', null, (str(b.name, 120) || email) + ' as ' + (b.role || 'no access'));
  const link = await makeLink(ctx, id);
  return json({ person: publicPerson(await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()), link });
});
route('PATCH', '/api/admin/people/:id', async (ctx, p) => {
  await requireAdmin(ctx);
  const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.id).first();
  if (!u) fail(404, 'Not found.');
  const b = await body(ctx), set = {};
  if ('name' in b) set.name = str(b.name, 120) || u.email;
  if ('email' in b) {
    const e = cleanEmail(b.email);
    if (e !== u.email && await ctx.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first()) fail(409, 'Another account already uses that email.');
    set.email = e;
  }
  if ('role' in b) { if (b.role !== null && !ROLES.includes(b.role)) fail(400, 'Unknown role.'); set.role = b.role; }
  if ('active' in b) set.active = b.active ? 1 : 0;
  if (u.id === ctx.user.id && (('role' in set && set.role !== u.role) || set.active === 0)) fail(400, 'You can’t change your own role or switch off your own access.');
  if ('units' in b) set.units = num(b.units);
  if ('invested' in b) set.invested = num(b.invested);
  if ('since' in b) set.since = date(b.since) || null;
  if ('title' in b) set.title = str(b.title, 120);
  if ('portal_id' in b) {
    const pid = str(b.portal_id, 24).toUpperCase();
    if (!/^[A-Z0-9-]{2,24}$/.test(pid)) fail(400, 'Portal IDs use letters, numbers and dashes.');
    if (pid !== u.portal_id && await ctx.env.DB.prepare('SELECT id FROM users WHERE portal_id = ?').bind(pid).first()) fail(409, 'That portal ID is taken.');
    set.portal_id = pid;
  }
  const keys = Object.keys(set);
  if (!keys.length) return json(publicPerson(u));
  await ctx.env.DB.prepare(`UPDATE users SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).bind(...keys.map(k => set[k]), u.id).run();
  const accessChanged = ('role' in set && set.role !== u.role) || set.active === 0 || ('email' in set && set.email !== u.email);
  if (accessChanged) await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
  await log(ctx, set.active === 0 ? 'access_removed' : ('role' in set && set.role !== u.role ? 'role_change' : 'person_edit'), null,
    ('role' in set && set.role !== u.role ? (u.role || 'none') + ' → ' + (set.role || 'none') + ': ' : '') + (set.name || u.name));
  return json(publicPerson(await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first()));
});
route('POST', '/api/admin/people/:id/link', async (ctx, p) => {
  await requireAdmin(ctx);
  const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.id).first();
  if (!u) fail(404, 'Not found.');
  if (u.id === ctx.user.id) fail(400, 'Change your own password from Help and security.');
  const b = await body(ctx);
  if (b.reset_password) {
    await ctx.env.DB.prepare('UPDATE users SET pw_hash = NULL, pw_salt = NULL WHERE id = ?').bind(u.id).run();
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
  }
  await log(ctx, 'link_issued', null, u.name + (b.reset_password ? ' (old password stopped)' : ''));
  return json(await makeLink(ctx, u.id));
});
route('POST', '/api/admin/people/:id/reset-2fa', async (ctx, p) => {
  await requireAdmin(ctx);
  const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.id).first();
  if (!u) fail(404, 'Not found.');
  if (u.id === ctx.user.id) fail(400, 'Ask another administrator to reset your two-factor.');
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE users SET totp_secret = NULL, totp_last = 0, recovery = '[]' WHERE id = ?").bind(u.id),
    ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
  ]);
  await log(ctx, 'twofa_reset', null, u.name);
  // They set up the new phone through a fresh one-time link, so a stolen password alone is never enough.
  return json(await makeLink(ctx, u.id));
});
route('POST', '/api/admin/people/:id/signout', async (ctx, p) => {
  await requireAdmin(ctx);
  await ctx.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?').bind(p.id, ctx.sessionHash).run();
  await log(ctx, 'signed_out', null, p.id);
  return json({ ok: true });
});

route('GET', '/api/admin/documents', async ctx => {
  await requireAdmin(ctx);
  const docs = (await ctx.env.DB.prepare('SELECT d.*, u.name AS owner FROM documents d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.grp, d.category, d.doc_date DESC, d.id DESC').all()).results;
  const counts = (await ctx.env.DB.prepare("SELECT doc_id, COUNT(*) AS n FROM activity WHERE action IN ('view','download','zip') GROUP BY doc_id").all()).results;
  const c = Object.fromEntries(counts.map(x => [x.doc_id, x.n]));
  return json(docs.map(d => ({ id: d.id, grp: d.grp, user_id: d.user_id, owner: d.owner || '', category: d.category, title: d.title, description: d.description, doc_date: d.doc_date || '', file_name: d.file_name, mime: d.mime, size: d.size, created_at: d.created_at, opened: c[d.id] || 0 })));
});
async function docFields(form, existing) {
  const grp = String(form.get('grp') || (existing && existing.grp) || '');
  if (grp !== 'personal' && !GROUPS[grp]) fail(400, 'Choose who can see it.');
  let user_id = null, category = str(form.get('category'), 60);
  if (grp === 'personal') {
    user_id = String(form.get('user_id') || (existing && existing.user_id) || '');
    if (!PCATS.includes(category)) category = 'other';
  }
  const title = str(form.get('title'), 200);
  if (!title) fail(400, 'Give the document a title.');
  return { grp, user_id, category: category || 'Documents', title, description: str(form.get('description'), 1000), doc_date: date(form.get('doc_date')) || null };
}
route('POST', '/api/admin/documents', async ctx => {
  await requireAdmin(ctx);
  let form;
  try { form = await ctx.req.formData(); } catch (e) { fail(400, 'Upload failed.'); }
  const f = await docFields(form);
  if (f.grp === 'personal' && !(await ctx.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(f.user_id).first())) fail(400, 'Choose the person this document belongs to.');
  const file = form.get('file');
  if (!file || typeof file === 'string') fail(400, 'Choose a file.');
  const bytes = new Uint8Array(await file.arrayBuffer()), name = safeName(file.name);
  const st = await storeFile(ctx, name, bytes);
  const r = await ctx.env.DB.prepare('INSERT INTO documents (grp, user_id, category, title, description, doc_date, file_name, r2_key, mime, size, sha256, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(f.grp, f.user_id, f.category, f.title, f.description, f.doc_date, name, st.r2_key, st.mime, st.size, st.sha256, ctx.user.id, now()).run();
  await log(ctx, 'upload', r.meta.last_row_id, f.grp === 'personal' ? 'personal document' : f.grp);
  return json({ id: r.meta.last_row_id });
});
route('PATCH', '/api/admin/documents/:id', async (ctx, p) => {
  await requireAdmin(ctx);
  const d = await ctx.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(+p.id || 0).first();
  if (!d) fail(404, 'Not found.');
  let form;
  try { form = await ctx.req.formData(); } catch (e) { fail(400, 'Bad request.'); }
  const f = await docFields(form, d);
  if (f.grp === 'personal' && !(await ctx.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(f.user_id).first())) fail(400, 'Choose the person this document belongs to.');
  let st = null;
  const file = form.get('file');
  if (file && typeof file !== 'string' && file.size) {
    st = await storeFile(ctx, safeName(file.name), new Uint8Array(await file.arrayBuffer()));
    st.file_name = safeName(file.name);
  }
  await ctx.env.DB.prepare('UPDATE documents SET grp=?, user_id=?, category=?, title=?, description=?, doc_date=?' + (st ? ', file_name=?, r2_key=?, mime=?, size=?, sha256=?' : '') + ' WHERE id = ?')
    .bind(...[f.grp, f.user_id, f.category, f.title, f.description, f.doc_date], ...(st ? [st.file_name, st.r2_key, st.mime, st.size, st.sha256] : []), d.id).run();
  if (st) await ctx.env.FILES.delete(d.r2_key);
  await log(ctx, st ? 'replace' : 'doc_edit', d.id, f.title);
  return json({ ok: true });
});
route('DELETE', '/api/admin/documents/:id', async (ctx, p) => {
  await requireAdmin(ctx);
  const d = await ctx.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(+p.id || 0).first();
  if (!d) fail(404, 'Not found.');
  await ctx.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(d.id).run();
  await ctx.env.FILES.delete(d.r2_key);
  await log(ctx, 'delete', d.id, d.title);
  return json({ ok: true });
});

route('GET', '/api/admin/transactions', async ctx => {
  await requireAdmin(ctx);
  const r = await ctx.env.DB.prepare('SELECT t.*, u.name, u.portal_id FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.tx_date DESC, t.id DESC').all();
  return json(r.results);
});
route('POST', '/api/admin/transactions', async ctx => {
  await requireAdmin(ctx);
  const b = await body(ctx);
  const u = await ctx.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(String(b.user_id || '')).first();
  if (!u) fail(400, 'Choose a person.');
  const type = str(b.type, 60) || 'Purchase', units = num(b.units), amount = num(b.amount), d = date(b.tx_date) || null;
  await ctx.env.DB.prepare('INSERT INTO transactions (user_id, tx_date, type, units, amount, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(u.id, d, type, units, amount, str(b.note, 500), ctx.user.id, now()).run();
  if (b.adjust) {
    if (['Purchase', 'Subscription', 'Transfer in', 'Gift'].includes(type)) {
      const invested = ['Purchase', 'Subscription'].includes(type) ? u.invested + amount : u.invested;
      await ctx.env.DB.prepare('UPDATE users SET units = ?, invested = ?, since = COALESCE(since, ?) WHERE id = ?').bind(u.units + units, invested, d, u.id).run();
    } else if (['Transfer out', 'Repurchase'].includes(type)) {
      await ctx.env.DB.prepare('UPDATE users SET units = ? WHERE id = ?').bind(Math.max(0, u.units - Math.abs(units)), u.id).run();
    }
  }
  await log(ctx, 'transaction', null, type + ' for ' + u.name);
  return json({ ok: true });
});
route('DELETE', '/api/admin/transactions/:id', async (ctx, p) => {
  await requireAdmin(ctx);
  await ctx.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(+p.id || 0).run();
  await log(ctx, 'transaction_delete', null, String(p.id));
  return json({ ok: true });
});

route('GET', '/api/admin/settings', async ctx => { await requireAdmin(ctx); return json(ctx.settings); });
route('PUT', '/api/admin/settings', async ctx => {
  await requireAdmin(ctx);
  const s = cleanSettings(await body(ctx));
  await ctx.env.DB.prepare('UPDATE settings SET data = ? WHERE id = 1').bind(JSON.stringify(s)).run();
  await log(ctx, 'settings');
  return json(s);
});
route('GET', '/api/admin/activity', async ctx => {
  await requireAdmin(ctx);
  const q = ctx.url.searchParams, map = {
    files: ['view', 'download', 'zip'], signin: ['signin', 'signin_failed', 'signout', 'timeout', 'password_set', 'password_change', 'twofa_setup'],
    denied: ['denied', 'signin_failed', 'error'],
    admin: ['upload', 'replace', 'delete', 'doc_edit', 'person_add', 'person_edit', 'role_change', 'access_removed', 'twofa_reset', 'link_issued', 'signed_out', 'transaction', 'transaction_delete', 'settings'],
  };
  const from = date(q.get('from')), to = date(q.get('to'));
  return json(await activityRows(ctx.env, {
    user: q.get('user') || null, types: map[q.get('type')] || null, limit: +q.get('limit') || 500,
    from: from ? Date.parse(from + 'T00:00:00Z') / 1000 : null, to: to ? Date.parse(to + 'T23:59:59Z') / 1000 : null,
  }));
});

/* ---------------------------------------------------------------- entry point */

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function secure(resp, isApi) {
  const r = new Response(resp.body, resp);
  r.headers.set('Content-Security-Policy', CSP);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'no-referrer');
  r.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  r.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (isApi || /text\/html/.test(r.headers.get('content-type') || '')) r.headers.set('Cache-Control', 'no-store');
  return r;
}

async function cleanup(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE created_at < ?').bind(t - SESSION_MAX),
    env.DB.prepare('DELETE FROM throttle WHERE window < ?').bind(t - 86400),
    env.DB.prepare('DELETE FROM links WHERE (used_at IS NOT NULL OR expires_at < ?) AND created_at < ?').bind(t, t - 30 * 86400),
  ]);
}

export default {
  async scheduled(event, env) { await cleanup(env); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return secure(await env.ASSETS.fetch(req), false);
    const ctx = { req, env, url, ip: req.headers.get('cf-connecting-ip') || '', ua: req.headers.get('user-agent') || '' };
    let resp;
    try {
      // Requests that change something must come from this site's own pages.
      if (req.method !== 'GET') {
        const origin = req.headers.get('origin');
        if (req.headers.get('x-aap') !== '1' || (origin && origin !== url.origin)) fail(403, 'Blocked.');
      }
      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) fail(404, 'Not found.');
      resp = await r.fn(ctx, url.pathname.match(r.re).groups || {});
    } catch (e) {
      if (e instanceof HttpError) resp = json({ error: e.message }, e.status);
      else { console.error(e && e.stack || e); resp = json({ error: 'Something went wrong. Please try again.' }, 500); }
    }
    if (ctx.setCookie) { resp = new Response(resp.body, resp); resp.headers.append('Set-Cookie', ctx.setCookie); }
    return secure(resp, true);
  },
};
