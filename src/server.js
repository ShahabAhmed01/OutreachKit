'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const csv = require('./csv');
const campaign = require('./campaign');
const utils = require('./utils');
const security = require('./security');
const validator = require('./validator');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const LOG = path.join(DATA, 'logs.txt');
const STOP = path.join(DATA, 'stop.flag');
const MARKER = path.join(DATA, '.logged-in');
const BACKUPS = path.join(DATA, 'backups');
const GUI = path.join(ROOT, 'gui');
const EXIT_GRACE_MS = Number(process.env.EXIT_GRACE_MS || 180000);

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(path.join(DATA, 'campaigns'), { recursive: true });
try {
  fs.rmSync(STOP, { force: true });
} catch {}

const clients = new Set();
let current = null;
let lastProbe = null;

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}` }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', apiLimiter);

// ─── SSE ───
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const hb = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch {}
  }, 15000);
  req.on('close', () => {
    clearInterval(hb);
    clients.delete(res);
  });
});

// Alias for backward compat
app.get('/api/events', (req, res) => {
  req.url = '/events';
  app.handle(req, res);
});

// ─── Static files ───
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function serveStatic(req, res) {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  const p = path.join(GUI, file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'missing' });
  const resolved = path.resolve(p);
  if (!resolved.startsWith(GUI + path.sep) && resolved !== GUI) {
    return res.status(404).json({ error: 'missing' });
  }
  res.set('Content-Type', MIME[path.extname(p)] || 'text/plain');
  res.set('Cache-Control', 'no-store');
  fs.createReadStream(p).pipe(res);
}

app.get('/', serveStatic);
app.get('/index.html', serveStatic);
app.get('/app.css', serveStatic);
app.get('/app.js', serveStatic);

// ─── Helpers ───
function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) {
    try {
      c.write(s);
    } catch {}
  }
}

function logLine(origin, line) {
  const ts = new Date().toISOString().slice(11, 19);
  const entry = `[${ts}] ${origin}: ${line}`;
  try {
    fs.appendFileSync(LOG, entry + '\n');
  } catch {}
  broadcast({
    time: new Date().toISOString(),
    from: origin,
    level: inferLevel(line),
    message: line
  });
}

function inferLevel(line) {
  if (/\[err\]/i.test(line)) return 'err';
  if (/\[warn\]/i.test(line)) return 'warn';
  if (/\[ok\]/i.test(line)) return 'ok';
  if (/\[step\]/i.test(line)) return 'step';
  return 'info';
}

function campaignCsv(campaignId, file) {
  const dir = path.join(DATA, 'campaigns', campaignId);
  return csv.readCsv(path.join(dir, file));
}

function campaignLeadRows(campaignId) {
  const commenters = campaignCsv(campaignId, 'commenters.csv');
  const sent = campaignCsv(campaignId, 'sent.csv');
  const contacted = campaignCsv(campaignId, 'already-contacted.csv');
  const replied = campaignCsv(campaignId, 'replied.csv');
  const byUser = new Map(commenters.map((r) => [r.username, r]));
  const sentAt = new Map(sent.map((r) => [r.username, r.sent_at || '']));
  const contactedAt = new Map(contacted.map((r) => [r.username, r.detected_at || '']));
  const repliedAt = new Map(replied.map((r) => [r.username, r.replied_at || '']));
  return [...byUser.keys()]
    .map((u) => {
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
    })
    .sort((a, b) => {
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
  const skip = new Set([
    ...sent.map((r) => r.username),
    ...contacted.map((r) => r.username),
    ...replied.map((r) => r.username)
  ]);
  const remaining = commenters.filter((r) => r.username && !skip.has(r.username)).length;
  return {
    total: commenters.length,
    sent: sent.length,
    replied: replied.length,
    contacted: contacted.length,
    remaining,
    sentToday: sent.filter((r) => (r.sent_at || '').startsWith(utils.todayKey())).length
  };
}

function globalStatus() {
  const cfg = config.loadConfig();
  const campaigns = campaign.listCampaigns();
  let totalCommenters = 0;
  let totalSent = 0;
  let totalReplied = 0;
  let running = false;
  let paused = false;
  let completed = false;
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
  try {
    loggedIn = fs.existsSync(MARKER);
  } catch {}
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
    config: cfg
  };
}

function runJob(name, script, args, campaignId) {
  if (current) return { ok: false, error: `${current.name} is already running` };
  try {
    fs.rmSync(STOP, { force: true });
  } catch {}
  const scriptArgs = [...(args || [])];
  if (campaignId) scriptArgs.push('--campaign', campaignId);
  const child = spawn(process.execPath, [path.join(ROOT, 'src', script), ...scriptArgs], {
    cwd: ROOT
  });
  current = { name, child, campaignId };
  logLine('server', `[step] Job started — ${name}${campaignId ? ` (${campaignId})` : ''}`);
  child.stdout.on('data', (d) => pump(name, d));
  child.stderr.on('data', (d) => pump(name, d));
  child.on('close', (code) => {
    logLine('server', `[info] Job finished — ${name} (exit ${code})`);
    if (current && current.name === name) current = null;
    if (campaignId && code === 0) {
      try {
        const c = campaign.loadCampaign(campaignId);
        if (c && c.status === 'scraping') {
          c.status = 'idle';
          campaign.saveCampaign(c);
        }
      } catch {}
    }
  });
  child.on('error', (e) => {
    logLine('server', `[err] Failed to start ${name}: ${e.message}`);
    if (current && current.name === name) current = null;
  });
  return { ok: true, name };
}

function pump(name, chunk) {
  String(chunk)
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((l) => {
      if (l.startsWith('RESULT:')) {
        try {
          const r = JSON.parse(l.slice('RESULT:'.length));
          lastProbe = { ...r, at: utils.nowIso() };
          if (r.loggedIn) {
            try {
              fs.writeFileSync(MARKER, String(Date.now()));
            } catch {}
          } else {
            try {
              fs.rmSync(MARKER, { force: true });
            } catch {}
          }
          broadcast({ type: 'probe', probe: lastProbe });
          return;
        } catch {}
      }
      logLine(name, l);
    });
}

function leadRows() {
  const commenters = csv.readCsv(path.join(DATA, 'commenters.csv'));
  const sent = csv.readCsv(path.join(DATA, 'sent.csv'));
  const contacted = csv.readCsv(path.join(DATA, 'already-contacted.csv'));
  const replied = csv.readCsv(path.join(DATA, 'replied.csv'));
  const byUser = new Map(commenters.map((r) => [r.username, r]));
  const sentAt = new Map(sent.map((r) => [r.username, r.sent_at || '']));
  const contactedAt = new Map(contacted.map((r) => [r.username, r.detected_at || '']));
  const repliedAt = new Map(replied.map((r) => [r.username, r.replied_at || '']));
  return [...byUser.keys()]
    .map((u) => {
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
    })
    .sort((a, b) => {
      const rank = { new: 0, replied: 1, sent: 2, contacted: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return String(b.commented_at).localeCompare(String(a.commented_at));
    });
}

function backupNow() {
  const stamp = utils.nowIso().replace(/[:.]+/g, '-').replace(/\++/g, 'm');
  const dir = path.join(BACKUPS, stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of [
    'commenters.csv',
    'sent.csv',
    'already-contacted.csv',
    'replied.csv',
    'logs.txt'
  ]) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, f));
  }
  if (fs.existsSync(config.CONFIG_PATH)) {
    fs.copyFileSync(config.CONFIG_PATH, path.join(dir, 'config.json'));
  }
  return dir;
}

function listBackups() {
  try {
    return fs
      .readdirSync(BACKUPS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        files: fs.readdirSync(path.join(BACKUPS, d.name)).length
      }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

function restoreBackup(name) {
  const v = security.isValidFilename(name);
  if (!v) throw new Error('invalid backup name');
  const dir = security.safePath(BACKUPS, name);
  if (!fs.existsSync(dir)) throw new Error('backup not found');
  for (const f of ['commenters.csv', 'sent.csv', 'already-contacted.csv', 'replied.csv']) {
    const src = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, f));
  }
  const cfgSrc = path.join(dir, 'config.json');
  if (fs.existsSync(cfgSrc)) fs.copyFileSync(cfgSrc, config.CONFIG_PATH);
  return dir;
}

// ─── Campaign API ───
app.get('/api/campaigns', (req, res) => {
  res.json(campaign.listCampaigns());
});

app.post('/api/campaigns', (req, res) => {
  const v = validator.validateCampaignBody(req.body);
  if (!v.valid) return res.status(400).json({ error: v.error });
  try {
    const detected = req.body.platform || campaign.detectPlatform(req.body.url);
    const c = campaign.createCampaign(v.data.name, detected, v.data.url);
    if (req.body.text1) c.text1 = req.body.text1;
    if (req.body.text2) c.text2 = req.body.text2;
    if (req.body.followups) c.followups = req.body.followups;
    campaign.saveCampaign(c);
    logLine('server', `[info] Campaign created — ${v.data.name} (${detected})`);
    res.status(201).json(c);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/campaigns/:id', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  c.stats = campaignStats(req.params.id);
  res.json(c);
});

app.delete('/api/campaigns/:id', (req, res) => {
  const ok = campaign.deleteCampaign(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  logLine('server', `[info] Campaign deleted — ${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/campaigns/:id/leads', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const status = req.query.status || 'all';
  const q = (req.query.q || '').toLowerCase();
  let rows = campaignLeadRows(req.params.id);
  if (status !== 'all') rows = rows.filter((r) => r.status === status);
  if (q) {
    rows = rows.filter(
      (r) =>
        (r.username || '').toLowerCase().includes(q) || (r.comment || '').toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

app.post('/api/campaigns/:id/scrape', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (current) return res.status(409).json({ error: 'Another job is running' });
  c.status = 'scraping';
  campaign.saveCampaign(c);
  runJob('scrape', 'scrape.js', [], req.params.id);
  res.json({ ok: true, status: 'scraping' });
});

app.post('/api/campaigns/:id/start', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (current) return res.status(409).json({ error: 'Another job is running' });
  c.status = 'running';
  campaign.saveCampaign(c);
  runJob('send', 'send.js', ['--dry'], req.params.id);
  res.json({ ok: true, status: 'running' });
});

app.post('/api/campaigns/:id/resume', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (current) return res.status(409).json({ error: 'Another job is running' });
  c.status = 'running';
  campaign.saveCampaign(c);
  runJob('send', 'send.js', ['--dry'], req.params.id);
  res.json({ ok: true, status: 'running' });
});

app.post('/api/campaigns/:id/pause', (req, res) => {
  const c = campaign.loadCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  c.status = 'paused';
  campaign.saveCampaign(c);
  try {
    fs.writeFileSync(STOP, '1');
  } catch {}
  logLine('server', `[warn] Campaign paused — ${req.params.id}`);
  res.json({ ok: true, status: 'paused' });
});

// ─── Dashboard / Status ───
app.get('/api/dashboard', (req, res) => res.json(globalStatus()));
app.get('/api/status', (req, res) => res.json(globalStatus()));

// ─── Leads (legacy flat) ───
app.get('/api/leads', (req, res) => {
  const q = String(req.query.q || '')
    .toLowerCase()
    .trim();
  const only = String(req.query.status || 'all');
  const limit = parseInt(req.query.limit || '1000', 10);
  const rows = leadRows()
    .filter(
      (r) =>
        (only === 'all' || r.status === only) &&
        (!q || r.username.toLowerCase().includes(q) || String(r.comment).toLowerCase().includes(q))
    )
    .slice(0, limit);
  res.json(rows);
});

// ─── Config ───
app.get('/api/config', (req, res) => res.json(globalStatus().config));

app.post('/api/config', (req, res) => {
  const v = validator.validateConfigBody(req.body);
  if (!v.valid) return res.status(400).json({ error: v.error });
  try {
    const cfg = config.loadConfig();
    Object.assign(cfg, v.data);
    config.saveConfig(cfg);
    logLine('server', '[info] Settings updated');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Jobs (legacy) ───
app.post('/api/job', (req, res) => {
  const v = validator.validateJobBody(req.body);
  if (!v.valid) return res.status(400).json({ error: v.error });
  const { name } = req.body;
  if (name === 'login' || name === 'connect') {
    return res.json(runJob('connect', 'login.js'));
  }
  if (name === 'scrape' || name === 'gather') {
    return res.json(runJob('gather', 'scrape.js'));
  }
  if (name === 'scan') return res.json(runJob('scan', 'scan-inbox.js'));
  if (name === 'probe') return res.json(runJob('probe', 'session.js'));
  if (name === 'campaign' || name === 'send') {
    return res.json(runJob('campaign', 'send.js', ['--dry']));
  }
  res.status(400).json({ error: 'unknown job' });
});

app.post('/api/send', (req, res) => {
  const v = validator.validateSendBody(req.body);
  if (!v.valid) return res.status(400).json({ error: v.error });
  const { dry } = req.body || {};
  res.json(runJob('campaign', 'send.js', dry ? ['--dry'] : []));
});

// ─── Stop ───
app.post('/api/stop', (req, res) => {
  try {
    fs.writeFileSync(STOP, '1');
    logLine('server', '[warn] Stop requested — the campaign will exit after the current lead.');
  } catch {}
  res.json({ ok: true });
});

// ─── Exit ───
app.post('/api/exit', (req, res) => {
  logLine('server', '[warn] Exit requested — finishing the current lead, then stopping.');
  try {
    fs.writeFileSync(STOP, '1');
  } catch {}
  const job = current;
  if (job) {
    const deadline = Date.now() + EXIT_GRACE_MS;
    const wait = setInterval(() => {
      if (
        !current ||
        current.name !== job.name ||
        job.child.exitCode !== null ||
        Date.now() > deadline
      ) {
        clearInterval(wait);
        if (job.child.exitCode === null) {
          try {
            job.child.kill();
          } catch {}
          logLine('server', '[warn] Campaign did not stop in time — terminated.');
        }
        process.exit(0);
      }
    }, 500);
  } else {
    setTimeout(() => process.exit(0), 300);
  }
  res.json({ ok: true });
});

// ─── Logs ───
app.get('/api/log', (req, res) => {
  const n = parseInt(req.query.n || '200', 10);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : 200;
  let lines = [];
  try {
    lines = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit);
  } catch {}
  res.json(lines);
});

// ─── Backup ───
app.post('/api/backup', (req, res) => {
  try {
    const dir = backupNow();
    logLine('server', `[info] Backup created — ${path.basename(dir)}`);
    res.json({ ok: true, name: path.basename(dir) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/backups', (req, res) => res.json(listBackups()));

app.post('/api/restore', (req, res) => {
  try {
    const { name } = req.body || {};
    const dir = restoreBackup(String(name || ''));
    logLine('server', `[info] Restored backup — ${path.basename(dir)}`);
    res.json({ ok: true, name: path.basename(dir) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── 404 catch-all ───
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// ─── Start server ───
const server = app.listen(PORT, () => {
  console.log(`OutreachKit GUI → http://localhost:${PORT}`);
  if (!process.env.OUTREACHKIT_NO_OPEN) {
    try {
      const { exec } = require('child_process');
      const cmd =
        process.platform === 'win32'
          ? `start "" http://localhost:${PORT}`
          : process.platform === 'darwin'
            ? `open http://localhost:${PORT}`
            : `xdg-open http://localhost:${PORT}`;
      exec(cmd);
    } catch {}
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`OutreachKit is already running → http://localhost:${PORT}`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

module.exports = app;
