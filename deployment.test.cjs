const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('authentication, CRUD, isolation, restart persistence and private files', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trackly-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, [path.resolve(__dirname, 'server.js')], {
      cwd: temp, env: { ...process.env, PORT: '0', NODE_ENV: 'test', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) resolve(match[0]); });
      child.once('exit', code => reject(new Error('Server exited: ' + code)));
      child.stderr.on('data', data => { if (!String(data).includes('ExperimentalWarning')) process.stderr.write(data); });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  async function request(route, method = 'GET', body, cookie) {
    return fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  try {
    await start();
    assert.equal((await request('/health')).status, 200);
    for (const route of ['/server.js', '/trackly.db', '/.env', '/package.json', '/trackly-project/server.js', '/.git/config']) assert.equal((await request(route)).status, 404);
    assert.equal((await request('/')).status, 200);
    assert.equal((await request('/api/applications')).status, 401);
    const user = { name: 'Test User', email: 'test@example.com', password: 'test-password-123' };
    const registration = await request('/api/auth/register', 'POST', user);
    assert.equal(registration.status, 200);
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/auth/register', 'POST', user)).status, 409);
    assert.equal((await request('/api/auth/login', 'POST', { ...user, password: 'wrong-password' })).status, 401);
    const application = { company: 'Example', role: 'Developer', status: 'Applied', date: '2026-09-13', nextStep: 'Follow up' };
    assert.equal((await request('/api/applications', 'POST', application, cookie)).status, 201);
    assert.equal((await request('/api/tasks', 'POST', { title: 'Prepare CV' }, cookie)).status, 201);
    assert.equal((await request('/api/prep-notes', 'POST', { company: 'Example', notes: 'Practice' }, cookie)).status, 201);
    const other = await request('/api/auth/register', 'POST', { ...user, email: 'other@example.com' });
    const otherCookie = other.headers.get('set-cookie').split(';')[0];
    assert.deepEqual((await (await request('/api/applications', 'GET', null, otherCookie)).json()).applications, []);
    await stop(); await start();
    assert.equal((await request('/api/me', 'GET', null, cookie)).status, 200);
    const apps = (await (await request('/api/applications', 'GET', null, cookie)).json()).applications;
    assert.equal(apps.length, 1);
    assert.equal((await request('/api/applications/' + apps[0].id, 'PATCH', { ...application, status: 'Interview' }, cookie)).status, 200);
    const tasks = (await (await request('/api/tasks', 'GET', null, cookie)).json()).tasks;
    assert.equal(tasks.length, 1);
    assert.equal((await request('/api/tasks/' + tasks[0].id, 'PATCH', { completed: true }, cookie)).status, 200);
    assert.equal((await (await request('/api/prep-notes', 'GET', null, cookie)).json()).notes.length, 1);
    assert.equal((await request('/api/applications/' + apps[0].id, 'DELETE', null, cookie)).status, 200);
    assert.equal((await request('/api/tasks/' + tasks[0].id, 'DELETE', null, cookie)).status, 200);
    assert.equal((await request('/api/auth/logout', 'POST', null, cookie)).status, 200);
    assert.equal((await request('/api/me', 'GET', null, cookie)).status, 401);
  } finally { if (child && child.exitCode === null) await stop(); fs.rmSync(temp, { recursive: true, force: true }); }
});

