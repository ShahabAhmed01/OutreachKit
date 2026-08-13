'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CAMPAIGNS_DIR = path.join(DATA, 'campaigns');
const PROFILE = path.join(ROOT, 'profile');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const IG_APP_ID = '936619743392459';

function ensureData() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
}

function defaults() {
  return {
    campaigns: [],
    activeCampaign: null,
    ownerUsername: '',
    dailyCap: 50,
    delayMinSec: 60,
    delayMaxSec: 120,
    pauseOnConsecutiveFailures: 3,
    pauseMinutes: 30,
    commentFilter: { enabled: false, keywords: [] },
    schedule: { enabled: false, start: '09:00', end: '23:00' }
  };
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function cleanList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const out = list.filter(x => typeof x === 'string' && x.trim()).map(s => s.trim());
  return out.length ? out : fallback;
}

function sanitizeConfig(cfg) {
  const c = { ...cfg };
  c.dailyCap = Math.round(clampNum(cfg.dailyCap, 1, 100, 50));
  c.pauseOnConsecutiveFailures = Math.round(clampNum(cfg.pauseOnConsecutiveFailures, 1, 20, 3));
  c.pauseMinutes = Math.round(clampNum(cfg.pauseMinutes, 1, 600, 30));
  c.delayMinSec = Math.round(clampNum(cfg.delayMinSec, 2, 3600, 60));
  c.delayMaxSec = Math.round(clampNum(cfg.delayMaxSec, 2, 3600, 120));
  if (c.delayMaxSec < c.delayMinSec) c.delayMaxSec = c.delayMinSec;
  const def = defaults();
  c.commentFilter = {
    enabled: !!(cfg.commentFilter && cfg.commentFilter.enabled),
    keywords: sanitizeList(cfg.commentFilter && cfg.commentFilter.keywords, []).map(s => s.toLowerCase())
  };
  c.schedule = {
    enabled: !!(cfg.schedule && cfg.schedule.enabled),
    start: validClock(cfg.schedule && cfg.schedule.start) || '09:00',
    end: validClock(cfg.schedule && cfg.schedule.end) || '23:00'
  };
  if (cfg.messages) {
    c.messages = {
      openers: cleanList(cfg.messages.openers, []),
      questions: cleanList(cfg.messages.questions, ['What are you working on right now?'])
    };
  }
  return c;
}

function sanitizeList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const out = [];
  for (const s of list) {
    if (typeof s === 'string' && s.trim()) out.push(s.trim());
  }
  return out.length ? out : fallback;
}

function validClock(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function loadConfig() {
  ensureData();
  try {
    const disk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return sanitizeConfig({ ...defaults(), ...disk });
  } catch {
    return sanitizeConfig(defaults());
  }
}

function saveConfig(patch) {
  const cfg = loadConfig();
  Object.assign(cfg, patch);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

function generateId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function createCampaign(name, platform, postUrl) {
  const id = generateId();
  const dir = path.join(CAMPAIGNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const campaign = {
    id,
    name: name || 'Untitled Campaign',
    platform: detectPlatform(postUrl) || platform || 'instagram',
    postUrl: postUrl || '',
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: {
      text1: [{ id: 'm1', content: 'Hey' }],
      text2: [{ id: 'm2', content: 'I read your comment under a post — are you interested?' }],
      followups: []
    },
    dailyCap: 50,
    delayMinSec: 60,
    delayMaxSec: 120,
    pauseOnConsecutiveFailures: 3,
    pauseMinutes: 30,
    commentFilter: { enabled: false, keywords: [] },
    schedule: { enabled: false, start: '09:00', end: '23:00' }
  };

  fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify(campaign, null, 2));
  fs.writeFileSync(path.join(dir, 'commenters.csv'), '');
  fs.writeFileSync(path.join(dir, 'sent.csv'), '');
  fs.writeFileSync(path.join(dir, 'already-contacted.csv'), '');
  fs.writeFileSync(path.join(dir, 'replied.csv'), '');

  const cfg = loadConfig();
  if (!cfg.campaigns) cfg.campaigns = [];
  cfg.campaigns.push({ id, name: campaign.name, platform: campaign.platform });
  if (!cfg.activeCampaign) cfg.activeCampaign = id;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizeConfig(cfg), null, 2));

  return campaign;
}

function loadCampaign(id) {
  const dir = path.join(CAMPAIGNS_DIR, id);
  const cfgPath = path.join(dir, 'campaign.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

function saveCampaign(campaignOrId, patch) {
  let id, campaign;
  if (typeof campaignOrId === 'string') {
    id = campaignOrId;
    campaign = loadCampaign(id);
    if (!campaign) return null;
    if (patch) Object.assign(campaign, patch, { updatedAt: nowIso() });
  } else if (campaignOrId && typeof campaignOrId === 'object') {
    campaign = campaignOrId;
    id = campaign.id;
    campaign.updatedAt = nowIso();
  } else {
    return null;
  }
  const dir = path.join(CAMPAIGNS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify(campaign, null, 2));

  const cfg = loadConfig();
  if (cfg.campaigns) {
    const idx = cfg.campaigns.findIndex(c => c.id === id);
    if (idx >= 0) {
      cfg.campaigns[idx].name = campaign.name;
      cfg.campaigns[idx].platform = campaign.platform;
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizeConfig(cfg), null, 2));
  return campaign;
}

function deleteCampaign(id) {
  const dir = path.join(CAMPAIGNS_DIR, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const cfg = loadConfig();
  if (cfg.campaigns) {
    cfg.campaigns = cfg.campaigns.filter(c => c.id !== id);
  }
  if (cfg.activeCampaign === id) {
    cfg.activeCampaign = cfg.campaigns && cfg.campaigns.length ? cfg.campaigns[0].id : null;
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizeConfig(cfg), null, 2));
  return true;
}

function listCampaigns() {
  const cfg = loadConfig();
  if (!cfg.campaigns || !cfg.campaigns.length) return [];
  const valid = [];
  for (const c of cfg.campaigns) {
    const campaign = loadCampaign(c.id);
    if (campaign) {
      valid.push({ ...c, status: campaign.status, postUrl: campaign.postUrl });
    }
  }
  // Clean orphaned entries from config
  if (valid.length !== cfg.campaigns.length) {
    cfg.campaigns = valid.map(c => ({ id: c.id, name: c.name, platform: c.platform }));
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizeConfig(cfg), null, 2));
  }
  return valid;
}

function campaignDataPath(id, file) {
  return path.join(CAMPAIGNS_DIR, id, file);
}

function detectPlatform(url) {
  if (!url) return 'instagram';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com|fb\.com|fb\.watch/i.test(url)) return 'facebook';
  return 'instagram';
}

function atomicWrite(p, text) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

function log(level, msg) {
  console.log(`[${level}] ${msg}`);
}
const info = m => log('info', m);
const ok = m => log('ok', m);
const warn = m => log('warn', m);
const err = m => log('err', m);
const step = m => log('step', m);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function stopSleep(ms, flagPath) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (flagPath && fs.existsSync(flagPath)) return true;
    await sleep(1000);
  }
  return false;
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQ = false;
          i++;
        }
      } else {
        cur += c;
        i++;
      }
    } else if (c === '"') {
      inQ = true;
      i++;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
      i++;
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

function escCsv(v) {
  const s = String(v === undefined || v === null ? '' : v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function readCsv(file, campaignId) {
  ensureData();
  const p = campaignId ? campaignDataPath(campaignId, file) : path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  const lines = parseCsvText(fs.readFileSync(p, 'utf8')).filter(r => r.some(cell => String(cell === undefined || cell === null ? '' : cell).trim() !== ''));
  if (lines.length < 2) return [];
  const head = lines[0].map(h => String(h).trim());
  return lines.slice(1).map(row => {
    const o = {};
    head.forEach((h, i) => {
      if (!h) return;
      o[h] = String(row[i] === undefined || row[i] === null ? '' : row[i]).trim();
    });
    return o;
  });
}

function writeCsv(file, rows, campaignId) {
  ensureData();
  const p = campaignId ? campaignDataPath(campaignId, file) : path.join(DATA, file);
  if (!rows.length) {
    atomicWrite(p, '');
    return;
  }
  const head = Object.keys(rows[0]);
  const body = rows.map(r => head.map(h => escCsv(r[h])).join(','));
  atomicWrite(p, [head.join(','), ...body].join('\n') + '\n');
}

function appendCsv(file, row, campaignId) {
  ensureData();
  const existing = readCsv(file, campaignId);
  existing.push(row);
  writeCsv(file, existing, campaignId);
}

const CHANNEL_CANDIDATES = [
  { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', channel: 'chrome' },
  { path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', channel: 'chrome' },
  { path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', channel: 'msedge' },
  { path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', channel: 'msedge' }
];

function findChannel() {
  const hit = CHANNEL_CANDIDATES.find(c => fs.existsSync(c.path));
  return hit ? hit.channel : null;
}

async function launch(headless) {
  ensureData();
  const channel = findChannel();
  return chromium.launchPersistentContext(PROFILE, {
    headless: !!headless,
    channel,
    viewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--start-maximized'
    ]
  });
}

let _ua = null;
async function getUA(ctx) {
  if (_ua) return _ua;
  let p = null;
  try {
    p = await ctx.newPage();
    _ua = await p.evaluate(() => navigator.userAgent);
  } catch {
    _ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
  } finally {
    if (p) await p.close().catch(() => {});
  }
  return _ua;
}

const apiPages = new WeakMap();
async function apiPage(ctx) {
  let p = apiPages.get(ctx);
  if (!p || p.isClosed()) {
    p = await ctx.newPage();
    await p.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    apiPages.set(ctx, p);
  }
  return p;
}

async function apiGet(ctx, url) {
  const p = await apiPage(ctx);
  const r = await p.evaluate(async u => {
    try {
      const res = await fetch(u, {
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
          accept: 'application/json, text/plain, */*'
        },
        credentials: 'include'
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      return { status: 0, text: 'NETWORK_ERROR ' + e.message };
    }
  }, url);
  const text = r.text || '';
  if (r.status === 401 || r.status === 403) throw new Error('SESSION_EXPIRED');
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (r.status === 200 && j === null) {
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      throw new Error('Instagram returned a page instead of JSON (session may have expired)');
    }
  }
  if (j) {
    if (j.status === 'fail' || j.message === 'login_required' || j.message === 'Not Authorized') {
      throw new Error(j.message === 'login_required' || j.message === 'Not Authorized' ? 'SESSION_EXPIRED' : `API error: ${j.message}`);
    }
  }
  return j;
}

async function apiPost(ctx, url, body) {
  const p = await apiPage(ctx);
  const r = await p.evaluate(async ({ url, body }) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
          accept: 'application/json, text/plain, */*'
        },
        credentials: 'include',
        body
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      return { status: 0, text: 'NETWORK_ERROR ' + e.message };
    }
  }, { url, body });
  const text = r.text || '';
  if (r.status === 401 || r.status === 403) throw new Error('SESSION_EXPIRED');
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (r.status === 200 && j === null) {
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      throw new Error('Instagram returned a page instead of JSON (session may have expired)');
    }
  }
  if (j) {
    if (j.status === 'fail' || j.message === 'login_required' || j.message === 'Not Authorized') {
      throw new Error(j.message === 'login_required' || j.message === 'Not Authorized' ? 'SESSION_EXPIRED' : `API error: ${j.message}`);
    }
  }
  return j;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowIso() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}` +
    `${sign}${oh}:${om}`
  );
}

function todayKey() {
  return nowIso().slice(0, 10);
}

function clearSession() {
  ensureData();
  const marker = path.join(DATA, '.logged-in');
  let markerRemoved = false;
  try {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    markerRemoved = true;
  } catch {}
  if (fs.existsSync(PROFILE)) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch {}
  }
  return markerRemoved;
}

module.exports = {
  ROOT,
  DATA,
  CAMPAIGNS_DIR,
  PROFILE,
  CONFIG_PATH,
  IG_APP_ID,
  ensureData,
  loadConfig,
  saveConfig,
  sanitizeConfig,
  generateId,
  createCampaign,
  loadCampaign,
  saveCampaign,
  deleteCampaign,
  listCampaigns,
  campaignDataPath,
  detectPlatform,
  log,
  info,
  ok,
  warn,
  err,
  step,
  sleep,
  stopSleep,
  readCsv,
  writeCsv,
  appendCsv,
  parseCsvText,
  escCsv,
  launch,
  apiGet,
  apiPost,
  nowIso,
  todayKey,
  clearSession
};
