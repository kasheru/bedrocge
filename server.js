// BEDROC website server — zero dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// optional .env file (KEY=value per line) so secrets stay out of content.json, which is public
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');
const CONTENT_FILE = path.join(DATA, 'content.json');
const DEFAULT_FILE = path.join(ROOT, 'default-content.json');
const AUTH_FILE = path.join(DATA, 'auth.json');

for (const d of [DATA, UPLOADS]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(CONTENT_FILE)) fs.copyFileSync(DEFAULT_FILE, CONTENT_FILE);

const ENQ_FILE = path.join(DATA, 'enquiries.json');
const readEnq = () => { try { return JSON.parse(fs.readFileSync(ENQ_FILE, 'utf8')); } catch { return []; } };
const enqHits = new Map();

// ---- forward enquiries to the Google Apps Script web app (sheet row + email) ----
async function forwardEnquiry(e) {
  const url = process.env.ENQUIRY_WEBHOOK;
  if (!url) return console.warn('ENQUIRY_WEBHOOK not set: enquiry saved locally only');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ secret: process.env.ENQUIRY_SECRET || '', ...e }), signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      if (r.ok && /"ok"\s*:\s*true/.test(t)) return;
      throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 120));
    } catch (err) {
      console.warn(`enquiry ${e.id} forward attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

// ---- auth ----
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash: hash(pw, salt) }));
}
if (!fs.existsSync(AUTH_FILE)) setPassword(process.env.ADMIN_PASSWORD || 'bedroc@admin');
const checkPassword = (pw) => {
  const a = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  return crypto.timingSafeEqual(Buffer.from(hash(String(pw), a.salt)), Buffer.from(a.hash));
};
const sessions = new Map(); // token -> expiry
const authed = (req) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) { sessions.delete(t); return false; }
  return true;
};
let failures = 0, lockUntil = 0;

// ---- helpers ----
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit = 12e6) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const serveFile = (res, file) => {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
};
const safeJoin = (base, rel) => {
  const p = path.normalize(path.join(base, decodeURIComponent(rel)));
  return p.startsWith(base + path.sep) ? p : null;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p === '/api/content' && req.method === 'GET') return send(res, 200, fs.readFileSync(CONTENT_FILE));
    if (p === '/api/content' && req.method === 'PUT') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      const obj = JSON.parse((await readBody(req)).toString());
      if (typeof obj !== 'object' || !obj) return send(res, 400, { error: 'Bad content' });
      fs.writeFileSync(CONTENT_FILE, JSON.stringify(obj, null, 2));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/content/reset' && req.method === 'POST') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      fs.copyFileSync(DEFAULT_FILE, CONTENT_FILE);
      return send(res, 200, { ok: true });
    }
    // ---- enquiries (public submit, admin read/delete) ----
    if (p === '/api/enquiry' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const now = Date.now(), hits = (enqHits.get(ip) || []).filter((t) => now - t < 3600e3);
      if (hits.length >= 5) return send(res, 429, { error: 'Too many enquiries. Please try again later.' });
      const b = JSON.parse((await readBody(req, 50e3)).toString() || '{}');
      if (b.website) return send(res, 200, { ok: true }); // honeypot
      const clip = (v, n) => String(v || '').trim().slice(0, n);
      const e = { id: crypto.randomBytes(6).toString('hex'), at: new Date().toISOString(),
        name: clip(b.name, 120), organisation: clip(b.organisation, 160), email: clip(b.email, 160), message: clip(b.message, 4000) };
      if (!e.name || !/^\S+@\S+\.\S+$/.test(e.email) || !e.message) return send(res, 400, { error: 'Name, valid email and details are required' });
      hits.push(now); enqHits.set(ip, hits);
      const list = readEnq(); list.unshift(e); fs.writeFileSync(ENQ_FILE, JSON.stringify(list.slice(0, 2000), null, 2));
      forwardEnquiry(e); // email + Google Sheet; the local copy above is the safety net
      return send(res, 200, { ok: true });
    }
    if (p === '/api/enquiries' && req.method === 'GET') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      return send(res, 200, readEnq());
    }
    if (p.startsWith('/api/enquiries/') && req.method === 'DELETE') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      const id = p.slice(15);
      fs.writeFileSync(ENQ_FILE, JSON.stringify(readEnq().filter((e) => e.id !== id), null, 2));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/session' && req.method === 'GET') {
      return authed(req) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'Unauthorized' });
    }
    if (p === '/api/login' && req.method === 'POST') {
      if (Date.now() < lockUntil) return send(res, 429, { error: 'Too many attempts. Try again shortly.' });
      const { password } = JSON.parse((await readBody(req)).toString() || '{}');
      if (!password || !checkPassword(password)) {
        if (++failures >= 5) { lockUntil = Date.now() + 60000; failures = 0; }
        return send(res, 401, { error: 'Wrong password' });
      }
      failures = 0;
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + 8 * 3600e3);
      return send(res, 200, { token });
    }
    if (p === '/api/password' && req.method === 'POST') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      const { current, next } = JSON.parse((await readBody(req)).toString());
      if (!checkPassword(current)) return send(res, 403, { error: 'Current password is wrong' });
      if (!next || next.length < 8) return send(res, 400, { error: 'New password must be 8+ characters' });
      setPassword(next);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/upload' && req.method === 'POST') {
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[req.headers['content-type']];
      if (!ext) return send(res, 400, { error: 'Only PNG, JPG, WEBP or GIF images' });
      const buf = await readBody(req, 10e6);
      const name = crypto.randomBytes(8).toString('hex') + ext;
      fs.writeFileSync(path.join(UPLOADS, name), buf);
      return send(res, 200, { url: '/uploads/' + name });
    }
    if (p.startsWith('/uploads/')) {
      const f = safeJoin(UPLOADS, p.slice(9));
      return f ? serveFile(res, f) : send(res, 400, 'Bad path', 'text/plain');
    }

    // static
    let rel = p === '/' ? 'index.html' : p === '/admin' ? 'admin.html' : p.slice(1);
    const f = safeJoin(PUBLIC, rel);
    if (!f) return send(res, 400, 'Bad path', 'text/plain');
    serveFile(res, f);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});
server.listen(PORT, () => console.log(`BEDROC site: http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin`));
