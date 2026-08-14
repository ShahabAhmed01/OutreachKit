'use strict';

const fs = require('fs');
const path = require('path');
const { DATA, CAMPAIGNS_DIR, CONFIG_PATH, ensureData, loadConfig, sanitizeConfig } = require('./config');
const { nowIso } = require('./utils');

function generateId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function detectPlatform(url) {
  if (!url) return 'instagram';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com|fb\.com|fb\.watch/i.test(url)) return 'facebook';
  return 'instagram';
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
      followups: [],
    },
    dailyCap: 50,
    delayMinSec: 60,
    delayMaxSec: 120,
    pauseOnConsecutiveFailures: 3,
    pauseMinutes: 30,
    commentFilter: { enabled: false, keywords: [] },
    schedule: { enabled: false, start: '09:00', end: '23:00' },
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
  let id;
  let campaign;
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
    const idx = cfg.campaigns.findIndex((c) => c.id === id);
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
    cfg.campaigns = cfg.campaigns.filter((c) => c.id !== id);
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
  if (valid.length !== cfg.campaigns.length) {
    cfg.campaigns = valid.map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitizeConfig(cfg), null, 2));
  }
  return valid;
}

module.exports = {
  generateId,
  detectPlatform,
  createCampaign,
  loadCampaign,
  saveCampaign,
  deleteCampaign,
  listCampaigns,
};
