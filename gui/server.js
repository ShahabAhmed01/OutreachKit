'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { readCsv, writeCsv, escCsv, nowIso, todayKey, sanitizeConfig, createCampaign, loadCampaign, saveCampaign, deleteCampaign, listCampaigns, detectPlatform } = require('../src/lib');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CAMPAIGNS_DIR = path.join(DATA, 'campaigns');
const GUI = __dirname;
const PORT = Number(process.env.PORT || 4876);
const LOG = path.join(DATA, 'logs.txt');
const CONFIG = path.join(ROOT, 'config.json');
const STOP = path.join(DATA, 'stop.flag');
const MARKER = path.join(DATA, '.logged-in');
const BACKUPS = path.join(DATA, 'backups');
const EXIT_GRACE_MS = Number(process.env.EXIT_GRACE_MS || 180000);

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
fs.rmSync(STOP, { force: true });

let clients = new Set();
let current = null;
let lastProbe = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) {
    try { c.write(s); } catch {}
  }
}

function logLine(origin, line) {
  const ts = new Date().toISOString().slice(11, 19);
  const entry = `[${ts}] ${origin}: ${line}`;
  try { fs.appendFileSync(LOG, entry + '\n'); } catch {}
  broadcast({ time: new Date().toISOString(), from: origin, level: inferLevel(line), message: line });
}

function inferLevel(line) {
  if (/\[err\]/i.test(line)) return 'err';
  if (/\[warn\]/i.test(line)) return 'warn';
  if (/\[ok\]/i.test(line)) return 'ok';
  if (/\[step\]/i.test(line)) return 'step';
  return 'info';
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readConfig() {
  try {
    return sanitizeConfig(JSON.parse(fs.readFileSync(CONFIG, 'utf8')));
  } catch {
    return sanitizeConfig({});
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG, JSON.stringify(sanitizeConfig(cfg), null, 2));
}

// ─── Campaign-scoped CSV readers ───
function campaignCsv(campaignId, file) {
  const dir = path.join(CAMPAIGNS_DIR, campaignId);
  return readCsv(path.join(dir, file));
}

function campaignLeadRows(campaignId) {
  const commenters = campaignCsv(campaignId, 'commenters.csv');
  const sent = campaignCsv(campaignId, 'sent.csv');
  const contacted = campaignCsv(campaignId, 'already-contacted.csv');
  const replied = campaignCsv(campaignId, 'replied.csv');
  const byUser = new Map(commenters.map(r => [r.username, r]));
  const sentAt = new Map(sent.map(r => [r.username, r.sent_at || '']));
  const contactedAt = new Map(contacted.map(r => [r.username, r.detected_at || '']));
  const repliedAt = new Map(replied.map(r => [r.username, r.replied_at || '']));
  return [...byUser.keys()].map(u => {
    let status = 'new';
    if (repliedAt.has(u)) status = 'replied';
    else if (sentAt.has(u)) status = 'sent';
    else if (contactedAt.has(u)) status = 'contacted';
    return {
      username: u,
      comment: (byUser.get(u) || {}).comment || '',
      commented_at: (byUser.get(u) || {}).commented_at || '',
      status,
      sent_at: sentAt.get(u) || '',
      detected_at: contactedAt.get(u) || '',
      replied_at: repliedAt.get(u) || ''
    };
  }).sort((a, b) => {
    const rank = { new: 0, replied: 1, sent: 2, contacted: 3 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return String(b.commented_at).localeCompare(String(a.commented_at));
  });
}

function campaignStats(campaignId) {
  const commenters = campaignCsv(campaignId, 'commenters.csv');
  const sent = campaignCsv(campaignId, 'sent.csv');
  const replied = campaignCsv(campaignId, 'replied.csv');
  const contacted = campaignCsv(campaignId, 'already-contacted.csv');
  const skip = new Set([...sent.map(r => r.username), ...contacted.map(r => r.username), ...replied.map(r => r.username)]);
  const remaining = commenters.filter(r => r.username && !skip.has(r.username)).length;
  return {
    total: commenters.length,
    sent: sent.length,
    replied: replied.length,
    contacted: contacted.length,
    remaining,
    sentToday: sent.filter(r => (r.sent_at || '').startsWith(todayKey())).length,
  };
}

function globalStatus() {
  const cfg = readConfig();
  const campaigns = listCampaigns();
  let totalCommenters = 0, totalSent = 0, totalReplied = 0;
  let running = false, paused = false, completed = false;
  for (const c of campaigns) {
    const s = campaignStats(c.id);
    totalCommenters += s.total;
    totalSent += s.sent;
    totalReplied += s.replied;
    if (c.status === 'running') running = true;
    if (c.status === 'paused') paused = true;
    if (c.status === 'completed') completed = true;
  }
  let loggedIn = false;
  try { loggedIn = fs.existsSync(MARKER); } catch {}
  return {
    running,
    paused,
    completed,
    loggedIn,
    probe: lastProbe,
    campaignCount: campaigns.length,
    total: totalCommenters,
    sent: totalSent,
    replied: totalReplied,
    remaining: totalCommenters - totalSent,
    config: cfg,
  };
}

function runJob(name, script, args, campaignId) {
  if (current) return { ok: false, error: `${current.name} is already running` };
  try { fs.rmSync(STOP, { force: true }); } catch {}
  const scriptArgs = [...(args || [])];
  if (campaignId) scriptArgs.push('--campaign', campaignId);
  const child = spawn(process.execPath, [path.join(ROOT, 'src', script), ...scriptArgs], { cwd: ROOT });
  current = { name, child, campaignId };
  logLine('server', `[step] Job started — ${name}${campaignId ? ` (${campaignId})` : ''}`);
  child.stdout.on('data', d => pump(name, d));
  child.stderr.on('data', d => pump(name, d));
  child.on('close', code => {
    logLine('server', `[info] Job finished — ${name} (exit ${code})`);
    if (current && current.name === name) current = null;
    if (campaignId && code === 0) {
      try {
        const c = loadCampaign(campaignId);
        if (c && c.status === 'scraping') { c.status = 'idle'; saveCampaign(c); }
      } catch {}
    }
  });
  child.on('error', e => {
    logLine('server', `[err] Failed to start ${name}: ${e.message}`);
    if (current && current.name === name) current = null;
  });
  return { ok: true, name };
}

function pump(name, chunk) {
  String(chunk).split(/\r?\n/).filter(Boolean).forEach(l => {
    if (l.startsWith('RESULT:')) {
      try {
        const r = JSON.parse(l.slice('RESULT:'.length));
        lastProbe = { ...r, at: nowIso() };
        if (r.loggedIn) {
          try { fs.writeFileSync(MARKER, String(Date.now())); } catch {}
        } else {
          try { fs.rmSync(MARKER, { force: true }); } catch {}
        }
        broadcast({ type: 'probe', probe: lastProbe });
        return;
      } catch {}
    }
    logLine(name, l);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', d => (b += d));
    req.on('end', () => resolve(b || '{}'));
  });
}

// ─── Legacy flat-file lead rows (for backward compat) ───
function leadRows() {
  const commenters = readCsv(path.join(DATA, 'commenters.csv'));
  const sent = readCsv(path.join(DATA, 'sent.csv'));
  const contacted = readCsv(path.join(DATA, 'already-contacted.csv'));
  const replied = readCsv(path.join(DATA, 'replied.csv'));
  const byUser = new Map(commenters.map(r => [r.username, r]));
  const sentAt = new Map(sent.map(r => [r.username, r.sent_at || '']));
  const contactedAt = new Map(contacted.map(r => [r.username, r.detected_at || '']));
  const repliedAt = new Map(replied.map(r => [r.username, r.replied_at || '']));
  return [...byUser.keys()].map(u => {
    let status = 'new';
    if (repliedAt.has(u)) status = 'replied';
    else if (sentAt.has(u)) status = 'sent';
    else if (contactedAt.has(u)) status = 'contacted';
    return {
      username: u,
      comment: (byUser.get(u) || {}).comment || '',
      commented_at: (byUser.get(u) || {}).commented_at || '',
      status,
      sent_at: sentAt.get(u) || '',
      detected_at: contactedAt.get(u) || '',
      replied_at: repliedAt.get(u) || ''
    };
  }).sort((a, b) => {
    const rank = { new: 0, replied: 1, sent: 2, contacted: 3 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return String(b.commented_at).localeCompare(String(a.commented_at));
  });
}

function backupNow() {
  const stamp = nowIso().replace(/[:.]+/g, '-').replace(/\++/g, 'm');
  const dir = path.join(BACKUPS, stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['commenters.csv', 'sent.csv', 'already-contacted.csv', 'replied.csv', 'logs.txt']) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, f));
  }
  if (fs.existsSync(CONFIG)) fs.copyFileSync(CONFIG, path.join(dir, 'config.json'));
  return dir;
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUPS, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, files: fs.readdirSync(path.join(BACKUPS, d.name)).length }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

function restoreBackup(name) {
  if (!/^[\w.-]+$/.test(name)) throw new Error('invalid backup name');
  const dir = path.join(BACKUPS, name);
  if (!fs.existsSync(dir)) throw new Error('backup not found');
  for (const f of ['commenters.csv', 'sent.csv', 'already-contacted.csv', 'replied.csv']) {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, f));
  }
  const cfgSrc = path.join(dir, 'config.json');
  if (fs.existsSync(cfgSrc)) fs.copyFileSync(cfgSrc, CONFIG);
  return dir;
}

// ─── Campaign API helpers ───
function matchCampaignRoute(pathname, method) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'campaigns') return null;
  if (parts.length === 2 && method === 'GET') return { action: 'list' };
  if (parts.length === 2 && method === 'POST') return { action: 'create' };
  if (parts.length >= 3) {
    const id = parts[2];
    if (parts.length === 3 && method === 'GET') return { action: 'get', id };
    if (parts.length === 3 && method === 'DELETE') return { action: 'delete', id };
    if (parts.length === 4 && method === 'POST') return { action: parts[3], id };
    if (parts.length === 4 && parts[3] === 'leads' && method === 'GET') return { action: 'leads', id };
  }
  return null;
}

// ─── HTTP Server ───
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // SSE
  if (pathname === '/events' || pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    const hb = setInterval(() => {
      try { res.write(': hb\n\n'); } catch {}
    }, 15000);
    req.on('close', () => {
      clearInterval(hb);
      clients.delete(res);
    });
    return;
  }

  // Static files
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) return serve(res, 'index.html');
  if (req.method === 'GET' && pathname === '/app.css') return serve(res, 'app.css');
  if (req.method === 'GET' && pathname === '/app.js') return serve(res, 'app.js');

  // ─── Campaign API ───
  if (req.method && pathname.startsWith('/api/campaigns')) {
    const route = matchCampaignRoute(pathname, req.method);
    if (!route) return json(res, 404, { error: 'not found' });

    try {
      if (route.action === 'list') {
        return json(res, 200, listCampaigns());
      }

      if (route.action === 'create') {
        const body = JSON.parse(await readBody(req));
        const { url: postUrl, name, platform, text1, text2, followups } = body;
        if (!postUrl) return json(res, 400, { error: 'url required' });
        if (!name) return json(res, 400, { error: 'name required' });
        const detected = platform || detectPlatform(postUrl);
        const campaign = createCampaign(name, detected, postUrl);
        if (text1) campaign.text1 = text1;
        if (text2) campaign.text2 = text2;
        if (followups) campaign.followups = followups;
        saveCampaign(campaign);
        logLine('server', `[info] Campaign created — ${name} (${detected})`);
        return json(res, 201, campaign);
      }

      if (route.action === 'get') {
        const c = loadCampaign(route.id);
        if (!c) return json(res, 404, { error: 'not found' });
        c.stats = campaignStats(route.id);
        return json(res, 200, c);
      }

      if (route.action === 'delete') {
        const ok = deleteCampaign(route.id);
        if (!ok) return json(res, 404, { error: 'not found' });
        logLine('server', `[info] Campaign deleted — ${route.id}`);
        return json(res, 200, { ok: true });
      }

      if (route.action === 'leads') {
        const c = loadCampaign(route.id);
        if (!c) return json(res, 404, { error: 'not found' });
        const status = url.searchParams.get('status') || 'all';
        const q = (url.searchParams.get('q') || '').toLowerCase();
        let rows = campaignLeadRows(route.id);
        if (status !== 'all') rows = rows.filter(r => r.status === status);
        if (q) rows = rows.filter(r => (r.username || '').toLowerCase().includes(q) || (r.comment || '').toLowerCase().includes(q));
        return json(res, 200, rows);
      }

      if (route.action === 'scrape') {
        const c = loadCampaign(route.id);
        if (!c) return json(res, 404, { error: 'not found' });
        if (current) return json(res, 409, { error: 'Another job is running' });
        c.status = 'scraping';
        saveCampaign(c);
        runJob('scrape', 'scrape.js', [], route.id);
        return json(res, 200, { ok: true, status: 'scraping' });
      }

      if (route.action === 'start' || route.action === 'resume') {
        const c = loadCampaign(route.id);
        if (!c) return json(res, 404, { error: 'not found' });
        if (current) return json(res, 409, { error: 'Another job is running' });
        c.status = 'running';
        saveCampaign(c);
        runJob('send', 'send.js', ['--dry'], route.id);
        return json(res, 200, { ok: true, status: 'running' });
      }

      if (route.action === 'pause') {
        const c = loadCampaign(route.id);
        if (!c) return json(res, 404, { error: 'not found' });
        c.status = 'paused';
        saveCampaign(c);
        try { fs.writeFileSync(STOP, '1'); } catch {}
        logLine('server', `[warn] Campaign paused — ${route.id}`);
        return json(res, 200, { ok: true, status: 'paused' });
      }

    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : 500;
      return json(res, code, { error: e.message });
    }
  }

  // ─── Dashboard API ───
  if (req.method === 'GET' && pathname === '/api/dashboard') {
    return json(res, 200, globalStatus());
  }

  // ─── Status (legacy) ───
  if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, globalStatus());

  // ─── Leads (legacy flat) ───
  if (pathname === '/api/leads' && req.method === 'GET') {
    const q = String(url.searchParams.get('q') || '').toLowerCase().trim();
    const only = String(url.searchParams.get('status') || 'all');
    const limit = parseInt(url.searchParams.get('limit') || '1000', 10);
    const rows = leadRows()
      .filter(r => (only === 'all' || r.status === only) && (!q || r.username.toLowerCase().includes(q) || String(r.comment).toLowerCase().includes(q)))
      .slice(0, limit);
    return json(res, 200, rows);
  }

  // ─── Config ───
  if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, globalStatus().config);

  if (pathname === '/api/config' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON' }); }
    try {
      const cfg = readConfig();
      for (const [k, v] of Object.entries(body)) {
        cfg[k] = v;
      }
      writeConfig(cfg);
      logLine('server', '[info] Settings updated');
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  // ─── Jobs (legacy) ───
  if (pathname === '/api/job' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON' }); }
    const { name } = body;
    if (name === 'login' || name === 'connect') return json(res, 200, runJob('connect', 'login.js'));
    if (name === 'scrape' || name === 'gather') return json(res, 200, runJob('gather', 'scrape.js'));
    if (name === 'scan') return json(res, 200, runJob('scan', 'scan-inbox.js'));
    if (name === 'probe') return json(res, 200, runJob('probe', 'session.js'));
    if (name === 'campaign' || name === 'send') return json(res, 200, runJob('campaign', 'send.js', ['--dry']));
    return json(res, 400, { error: 'unknown job' });
  }

  if (pathname === '/api/send' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON' }); }
    const { dry } = body;
    return json(res, 200, runJob('campaign', 'send.js', dry ? ['--dry'] : []));
  }

  // ─── Stop ───
  if (pathname === '/api/stop' && req.method === 'POST') {
    try {
      fs.writeFileSync(STOP, '1');
      logLine('server', '[warn] Stop requested — the campaign will exit after the current lead.');
    } catch {}
    return json(res, 200, { ok: true });
  }

  // ─── Exit ───
  if (pathname === '/api/exit' && req.method === 'POST') {
    logLine('server', '[warn] Exit requested — finishing the current lead, then stopping.');
    try { fs.writeFileSync(STOP, '1'); } catch {}
    const job = current;
    if (job) {
      const deadline = Date.now() + EXIT_GRACE_MS;
      const wait = setInterval(() => {
        if (!current || current.name !== job.name || job.child.exitCode !== null || Date.now() > deadline) {
          clearInterval(wait);
          if (job.child.exitCode === null) {
            try { job.child.kill(); } catch {}
            logLine('server', '[warn] Campaign did not stop in time — terminated.');
          }
          process.exit(0);
        }
      }, 500);
    } else {
      setTimeout(() => process.exit(0), 300);
    }
    return json(res, 200, { ok: true });
  }

  // ─── Logs ───
  if (pathname === '/api/log' && req.method === 'GET') {
    const n = parseInt(url.searchParams.get('n') || '200', 10);
    let lines = [];
    try {
      lines = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n);
    } catch {}
    return json(res, 200, lines);
  }

  // ─── Backup ───
  if (pathname === '/api/backup' && req.method === 'POST') {
    try {
      const dir = backupNow();
      logLine('server', `[info] Backup created — ${path.basename(dir)}`);
      return json(res, 200, { ok: true, name: path.basename(dir) });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (pathname === '/api/backups' && req.method === 'GET') return json(res, 200, listBackups());

  if (pathname === '/api/restore' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON' }); }
    try {
      const { name } = body;
      const dir = restoreBackup(String(name || ''));
      logLine('server', `[info] Restored backup — ${path.basename(dir)}`);
      return json(res, 200, { ok: true, name: path.basename(dir) });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  json(res, 404, { error: 'not found' });
});

function serve(res, file) {
  const p = path.join(GUI, file);
  if (!fs.existsSync(p)) return json(res, 404, { error: 'missing' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`LeadLoop is already running → http://localhost:${PORT}`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`LeadLoop GUI → http://localhost:${PORT}`);
  if (!process.env.LEADLOOP_NO_OPEN) {
    try { exec(`start "" http://localhost:${PORT}`); } catch {}
  }
});
