// Small helpers: encoding, hashing, AES-GCM, PBKDF2, TOTP (RFC 6238) and a store-only ZIP writer.
// Everything uses the Workers runtime's built-in Web Crypto.

const te = new TextEncoder();

export function b64(buf) {
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
export function b64url(buf) { return b64(buf).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
export function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
export function uuid() { return crypto.randomUUID(); }
export async function sha256hex(data) { return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data)); }

/** Constant-time comparison of two strings. */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ---------------------------------------------------------------- AES-256-GCM with FILE_KEY */

const keyCache = new Map();
async function aesKey(env) {
  if (!env.FILE_KEY) throw new Error('FILE_KEY is not set');
  if (!keyCache.has(env.FILE_KEY)) {
    const raw = unb64(env.FILE_KEY);
    if (raw.length !== 32) throw new Error('FILE_KEY must be 32 bytes, base64');
    keyCache.set(env.FILE_KEY, crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keyCache.get(env.FILE_KEY);
}
/** Encrypt bytes. Output: 'AAC1' | iv(12) | ciphertext+tag. `purpose` is bound as additional data. */
export async function encrypt(env, bytes, purpose) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(purpose) }, await aesKey(env), bytes);
  const out = new Uint8Array(4 + 12 + ct.byteLength);
  out.set(te.encode('AAC1'), 0); out.set(iv, 4); out.set(new Uint8Array(ct), 16);
  return out;
}
export async function decrypt(env, blob, purpose) {
  const u = new Uint8Array(blob);
  if (u.length < 16 || String.fromCharCode(u[0], u[1], u[2], u[3]) !== 'AAC1') throw new Error('not an encrypted portal file');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(4, 16), additionalData: te.encode(purpose) }, await aesKey(env), u.subarray(16)));
}
export async function encryptText(env, text, purpose) { return b64(await encrypt(env, te.encode(text), purpose)); }
export async function decryptText(env, s, purpose) { return new TextDecoder().decode(await decrypt(env, unb64(s), purpose)); }

/* ---------------------------------------------------------------- keyed hashes (a secret "pepper") */

// HMAC-SHA256 under a key derived from FILE_KEY. A copy of the database alone is then useless for
// guessing passwords or recovery codes: the key lives only in the Worker's secrets.
const macCache = new Map();
async function macKey(env) {
  if (!env.FILE_KEY) throw new Error('FILE_KEY is not set');
  if (!macCache.has(env.FILE_KEY)) {
    const raw = unb64(env.FILE_KEY), label = te.encode('aeroassist-portal-hmac-v1'), both = new Uint8Array(label.length + raw.length);
    both.set(label, 0); both.set(raw, label.length);
    const derived = await crypto.subtle.digest('SHA-256', both);
    macCache.set(env.FILE_KEY, crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return macCache.get(env.FILE_KEY);
}
export async function keyedHash(env, purpose, value) {
  return b64(await crypto.subtle.sign('HMAC', await macKey(env), te.encode(purpose + '\u0000' + value)));
}

/* ---------------------------------------------------------------- passwords */

// Workers' Web Crypto allows at most 100,000 PBKDF2 iterations, so the result is also peppered
// with keyedHash. The count is stored per hash so it can be raised later.
export const PBKDF2_ITER = 100000;
export async function hashPassword(env, password, saltB64, iter = PBKDF2_ITER) {
  const salt = saltB64 ? unb64(saltB64) : randomBytes(16);
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return { hash: await keyedHash(env, 'pw', b64(bits)), salt: b64(salt), iter };
}
export async function verifyPassword(env, password, user) {
  if (!user || !user.pw_hash) {
    await hashPassword(env, password || 'x');       // same work either way, so timing says nothing
    return false;
  }
  const h = await hashPassword(env, password, user.pw_salt, user.pw_iter || PBKDF2_ITER);
  return safeEqual(h.hash, user.pw_hash);
}

/* ---------------------------------------------------------------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(s) {
  s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const c of s) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function hotp(secretBytes, counter) {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
/** Returns the accepted time step, or 0. Accepts one step either side and never a step at or before `lastStep`. */
export async function verifyTotp(secretB32, code, lastStep, now = Date.now()) {
  code = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return 0;
  const step = Math.floor(now / 30000), secret = unbase32(secretB32);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    if (safeEqual(await hotp(secret, s), code)) return s;
  }
  return 0;
}
export function newTotpSecret() { return base32(randomBytes(20)); }

/** Ten one-time recovery codes like 7KQ4-M2XD. */
export function newRecoveryCodes() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    const r = randomBytes(8); let s = '';
    for (let i = 0; i < 8; i++) s += A[r[i] % A.length];
    return s.slice(0, 4) + '-' + s.slice(4);
  });
}
export function normRecovery(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* ---------------------------------------------------------------- ZIP (stored, no compression) */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(files) {               // files: [{name, data: Uint8Array}]
  const parts = [], central = []; let offset = 0;
  const d = new Date(), time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  for (const f of files) {
    const name = te.encode(f.name), crc = crc32(f.data), len = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, len, true); h.setUint32(22, len, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, len, true); c.setUint32(24, len, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + len;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
