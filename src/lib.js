'use strict';

// Backward-compatibility barrel — re-exports from focused modules.
// New code should import directly from the specific module.

const config = require('./config');
const csv = require('./csv');
const campaign = require('./campaign');
const browser = require('./browser');
const utils = require('./utils');
const security = require('./security');
const validator = require('./validator');

module.exports = {
  // Config
  ROOT: config.ROOT,
  DATA: config.DATA,
  CAMPAIGNS_DIR: config.CAMPAIGNS_DIR,
  PROFILE: config.PROFILE,
  CONFIG_PATH: config.CONFIG_PATH,
  ensureData: config.ensureData,
  loadConfig: config.loadConfig,
  saveConfig: config.saveConfig,
  sanitizeConfig: config.sanitizeConfig,

  // CSV
  parseCsvText: csv.parseCsvText,
  escCsv: csv.escCsv,
  readCsv: csv.readCsv,
  writeCsv: csv.writeCsv,
  appendCsv: csv.appendCsv,
  campaignDataPath: csv.campaignDataPath,

  // Campaign
  generateId: campaign.generateId,
  detectPlatform: campaign.detectPlatform,
  createCampaign: campaign.createCampaign,
  loadCampaign: campaign.loadCampaign,
  saveCampaign: campaign.saveCampaign,
  deleteCampaign: campaign.deleteCampaign,
  listCampaigns: campaign.listCampaigns,

  // Browser
  launch: browser.launch,
  apiGet: browser.apiGet,
  apiPost: browser.apiPost,

  // Security
  isValidFilename: security.isValidFilename,
  safePath: security.safePath,
  sanitizeString: security.sanitizeString,
  isValidOutreachUrl: security.isValidOutreachUrl,
  clampNumber: security.clampNumber,

  // Validator
  validateCampaignBody: validator.validateCampaignBody,
  validateConfigBody: validator.validateConfigBody,
  validateBackupName: validator.validateBackupName,
  validateSendBody: validator.validateSendBody,
  validateJobBody: validator.validateJobBody,

  // Utils
  nowIso: utils.nowIso,
  todayKey: utils.todayKey,
  log: utils.log,
  info: utils.info,
  ok: utils.ok,
  warn: utils.warn,
  err: utils.err,
  step: utils.step,
  sleep: utils.sleep,
  stopSleep: utils.stopSleep,
  clearSession: () => {
    const fs = require('fs');
    const path = require('path');
    const marker = path.join(config.DATA, '.logged-in');
    let markerRemoved = false;
    try {
      if (fs.existsSync(marker)) fs.unlinkSync(marker);
      markerRemoved = true;
    } catch {}
    if (fs.existsSync(config.PROFILE)) {
      try {
        fs.rmSync(config.PROFILE, { recursive: true, force: true });
      } catch {}
    }
    return markerRemoved;
  }
};
