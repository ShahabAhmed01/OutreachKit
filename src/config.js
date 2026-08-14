'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CAMPAIGNS_DIR = path.join(DATA, 'campaigns');
const PROFILE = path.join(ROOT, 'profile');
const CONFIG_PATH = path.join(ROOT, 'config.json');

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
    schedule: { enabled: false, start: '09:00', end: '23:00' },
  };
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function cleanList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const out = list.filter((x) => typeof x === 'string' && x.trim()).map((s) => s.trim());
  return out.length ? out : fallback;
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

function sanitizeConfig(cfg) {
  const c = { ...cfg };
  c.dailyCap = Math.round(clampNum(cfg.dailyCap, 1, 100, 50));
  c.pauseOnConsecutiveFailures = Math.round(clampNum(cfg.pauseOnConsecutiveFailures, 1, 20, 3));
  c.pauseMinutes = Math.round(clampNum(cfg.pauseMinutes, 1, 600, 30));
  c.delayMinSec = Math.round(clampNum(cfg.delayMinSec, 2, 3600, 60));
  c.delayMaxSec = Math.round(clampNum(cfg.delayMaxSec, 2, 3600, 120));
  if (c.delayMaxSec < c.delayMinSec) c.delayMaxSec = c.delayMinSec;
  c.commentFilter = {
    enabled: !!(cfg.commentFilter && cfg.commentFilter.enabled),
    keywords: sanitizeList(cfg.commentFilter && cfg.commentFilter.keywords, []).map((s) =>
      s.toLowerCase()
    ),
  };
  c.schedule = {
    enabled: !!(cfg.schedule && cfg.schedule.enabled),
    start: validClock(cfg.schedule && cfg.schedule.start) || '09:00',
    end: validClock(cfg.schedule && cfg.schedule.end) || '23:00',
  };
  if (cfg.messages) {
    c.messages = {
      openers: cleanList(cfg.messages.openers, []),
      questions: cleanList(cfg.messages.questions, ['What are you working on right now?']),
    };
  }
  return c;
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

module.exports = {
  ROOT,
  DATA,
  CAMPAIGNS_DIR,
  PROFILE,
  CONFIG_PATH,
  ensureData,
  defaults,
  sanitizeConfig,
  loadConfig,
  saveConfig,
  validClock,
  clampNum,
  cleanList,
  sanitizeList,
};
