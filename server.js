const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

const PORT = process.env.PORT || 3000;
const root = __dirname;
if (process.env.NODE_ENV === 'production' && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before deploying.');
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL || 'file:trackly.db', authToken: process.env.TURSO_AUTH_TOKEN });
const db = {
  exec: sql => client.executeMultiple(sql),
  prepare: sql => ({
    get: async (...args) => (await client.execute({ sql, args })).rows[0],
    all: async (...args) => (await client.execute({ sql, args })).rows,
    run: async (...args) => { const result = await client.execute({ sql, args }); return { lastInsertRowid: result.lastInsertRowid }; }
  })
};
async function start() {
await db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS applications (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), company TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Applied','Interview','Offer','Rejected')), date TEXT NOT NULL, next_step TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;
CREATE TABLE IF NOT EXISTS prep_notes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), company TEXT NOT NULL, interview_date TEXT, notes TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;`);
await db.exec(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, due_date TEXT, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT;`);

const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 1e6) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid request data')); } }); });
async function getUser(req) { const match = (req.headers.cookie || '').match(/trackly_session=([^;]+)/); return match ? await db.prepare('SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(crypto.createHash('sha256').update(match[1]).digest('hex'), Date.now()) : null; }
async function requireUser(req, res) { const user = await getUser(req); if (!user) { json(res, 401, { error: 'Please log in to continue.' }); return null; } return user; }
function hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
async function createSession(user, res) { const token = crypto.randomBytes(32).toString('hex'); await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(crypto.createHash('sha256').update(token).digest('hex'), user.id, Date.now() + 604800000); json(res, 200, { user }, { 'Set-Cookie': `trackly_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); }
const publicFiles = new Set(["app.js","index.html","insights.html","insights.js","pages.css","prep.html","prep.js","scanner.css","scanner.html","scanner.js","styles.css","tasks.css"]);
function serveFile(res, pathname) { const requested = pathname === '/' ? 'index.html' : pathname.slice(1); if (!publicFiles.has(requested)) return json(res, 404, { error: 'Not found' }); const filePath = path.resolve(root, requested); if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(res, 404, { error: 'Not found' }); const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }; res.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` }); fs.createReadStream(filePath).pipe(res); }

await db.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL) STRICT;');
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const { pathname } = url;
  try {
    if (req.method === 'GET' && pathname === '/health') { await client.execute('SELECT 1'); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && pathname === '/api/me') { const user = await requireUser(req, res); if (user) json(res, 200, { user }); return; }
    if (req.method === 'POST' && (pathname === '/api/auth/register' || pathname === '/api/auth/login')) {
      const data = await readBody(req); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return json(res, 400, { error: 'Enter a valid email and a password of at least 8 characters.' });
      if (pathname.endsWith('register')) { const name = String(data.name || '').trim(); if (name.length < 2) return json(res, 400, { error: 'Please enter your name.' }); const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email); if (exists) return json(res, 409, { error: 'An account already exists with this email. Please log in.' }); const salt = crypto.randomBytes(16).toString('hex'); const result = await db.prepare('INSERT INTO users (name,email,password_hash,password_salt) VALUES (?,?,?,?)').run(name, email, hash(password, salt), salt); return await createSession({ id: Number(result.lastInsertRowid), name, email }, res); }
      const row = await db.prepare('SELECT * FROM users WHERE email = ?').get(email); if (!row || !crypto.timingSafeEqual(Buffer.from(hash(password, row.password_salt)), Buffer.from(row.password_hash))) return json(res, 401, { error: 'Incorrect email or password.' }); return await createSession({ id: row.id, name: row.name, email: row.email }, res);
    }
    if (req.method === 'POST' && pathname === '/api/auth/logout') { const match = (req.headers.cookie || '').match(/trackly_session=([^;]+)/); if (match) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(crypto.createHash('sha256').update(match[1]).digest('hex')); return json(res, 200, { ok: true }, { 'Set-Cookie': 'trackly_session=; HttpOnly; Path=/; Max-Age=0' }); }
    if (pathname === '/api/applications') { const user = await requireUser(req, res); if (!user) return; if (req.method === 'GET') return json(res, 200, { applications: await db.prepare('SELECT id,company,role,status,date,next_step AS nextStep FROM applications WHERE user_id = ? ORDER BY date DESC, id DESC').all(user.id) }); if (req.method === 'POST') { const data = await readBody(req); const statuses = ['Applied', 'Interview', 'Offer', 'Rejected']; if (!String(data.company || '').trim() || !String(data.role || '').trim() || !statuses.includes(data.status) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) return json(res, 400, { error: 'Please complete all required fields.' }); await db.prepare('INSERT INTO applications (user_id,company,role,status,date,next_step) VALUES (?,?,?,?,?,?)').run(user.id, data.company.trim(), data.role.trim(), data.status, data.date, String(data.nextStep || '').trim()); return json(res, 201, { ok: true }); } }
    if (pathname === '/api/prep-notes') { const user = await requireUser(req, res); if (!user) return; if (req.method === 'GET') return json(res, 200, { notes: await db.prepare('SELECT id,company,interview_date AS interviewDate,notes FROM prep_notes WHERE user_id = ? ORDER BY interview_date ASC, id DESC').all(user.id) }); if (req.method === 'POST') { const data = await readBody(req); if (!String(data.company || '').trim() || !String(data.notes || '').trim()) return json(res, 400, { error: 'Enter a company and your preparation notes.' }); await db.prepare('INSERT INTO prep_notes (user_id,company,interview_date,notes) VALUES (?,?,?,?)').run(user.id, data.company.trim(), data.interviewDate || null, data.notes.trim()); return json(res, 201, { ok: true }); } }
    if (pathname === '/api/tasks') { const user = await requireUser(req, res); if (!user) return; if (req.method === 'GET') return json(res, 200, { tasks: await db.prepare('SELECT id,title,due_date AS dueDate,completed FROM tasks WHERE user_id = ? ORDER BY completed ASC, due_date ASC, id DESC').all(user.id) }); if (req.method === 'POST') { const data = await readBody(req); if (!String(data.title || '').trim()) return json(res, 400, { error: 'Enter a task title.' }); await db.prepare('INSERT INTO tasks (user_id,title,due_date) VALUES (?,?,?)').run(user.id, data.title.trim(), data.dueDate || null); return json(res, 201, { ok: true }); } }
    const match = pathname.match(/^\/api\/applications\/(\d+)$/); if (match && req.method === 'DELETE') { const user = await requireUser(req, res); if (!user) return; await db.prepare('DELETE FROM applications WHERE id = ? AND user_id = ?').run(Number(match[1]), user.id); return json(res, 200, { ok: true }); }
    if (match && req.method === 'PATCH') { const user = await requireUser(req, res); if (!user) return; const data = await readBody(req); const statuses = ['Applied', 'Interview', 'Offer', 'Rejected']; if (!String(data.company || '').trim() || !String(data.role || '').trim() || !statuses.includes(data.status) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) return json(res, 400, { error: 'Please complete all required fields.' }); await db.prepare('UPDATE applications SET company = ?, role = ?, status = ?, date = ?, next_step = ? WHERE id = ? AND user_id = ?').run(data.company.trim(), data.role.trim(), data.status, data.date, String(data.nextStep || '').trim(), Number(match[1]), user.id); return json(res, 200, { ok: true }); }
    const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)$/); if (taskMatch && req.method === 'PATCH') { const user = await requireUser(req, res); if (!user) return; const data = await readBody(req); await db.prepare('UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?').run(data.completed ? 1 : 0, Number(taskMatch[1]), user.id); return json(res, 200, { ok: true }); } if (taskMatch && req.method === 'DELETE') { const user = await requireUser(req, res); if (!user) return; await db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(Number(taskMatch[1]), user.id); return json(res, 200, { ok: true }); }
    if (req.method === 'GET') return serveFile(res, pathname); json(res, 404, { error: 'Not found' });
  } catch (error) { console.error(error); json(res, 500, { error: 'Server error. Please try again.' }); }
}).listen(PORT, '0.0.0.0', function () { console.log(`Trackly is running at http://127.0.0.1:${this.address().port}`); });

}
start().catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
