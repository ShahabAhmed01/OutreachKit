'use strict';

const { isValidOutreachUrl, clampNumber, isValidFilename, sanitizeString } = require('./security');

/**
 * Validate a campaign creation request body.
 * @param {object} body - The request body
 * @returns {{ valid: boolean, error?: string, data?: object }}
 */
function validateCampaignBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { name, url, platform } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { valid: false, error: 'Campaign name is required' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Campaign name must be 100 characters or less' };
  }

  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Campaign URL is required' };
  }

  if (!isValidOutreachUrl(url)) {
    return { valid: false, error: 'URL must be a valid Instagram or Facebook URL' };
  }

  const validPlatforms = ['instagram', 'facebook'];
  if (platform && !validPlatforms.includes(platform)) {
    return { valid: false, error: 'Platform must be "instagram" or "facebook"' };
  }

  return {
    valid: true,
    data: {
      name: sanitizeString(name),
      url: url.trim(),
      platform: platform || undefined
    }
  };
}

/**
 * Validate a config update request body.
 * @param {object} body - The request body
 * @returns {{ valid: boolean, error?: string, data?: object }}
 */
function validateConfigBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const data = {};

  if (body.dailyCap !== undefined) {
    data.dailyCap = clampNumber(body.dailyCap, 1, 100, 50);
  }

  if (body.delayMinSec !== undefined) {
    data.delayMinSec = clampNumber(body.delayMinSec, 2, 3600, 60);
  }

  if (body.delayMaxSec !== undefined) {
    data.delayMaxSec = clampNumber(body.delayMaxSec, 2, 3600, 120);
  }

  if (body.pauseOnConsecutiveFailures !== undefined) {
    data.pauseOnConsecutiveFailures = clampNumber(body.pauseOnConsecutiveFailures, 1, 50, 3);
  }

  if (body.pauseMinutes !== undefined) {
    data.pauseMinutes = clampNumber(body.pauseMinutes, 1, 600, 30);
  }

  if (body.messages && typeof body.messages === 'object') {
    const { openers, questions } = body.messages;
    if (Array.isArray(openers)) {
      data.messages = data.messages || {};
      data.messages.openers = openers
        .filter((m) => typeof m === 'string' && m.trim())
        .map((m) => m.trim());
    }
    if (Array.isArray(questions)) {
      data.messages = data.messages || {};
      data.messages.questions = questions
        .filter((m) => typeof m === 'string' && m.trim())
        .map((m) => m.trim());
    }
  }

  if (body.commentFilter && typeof body.commentFilter === 'object') {
    data.commentFilter = {
      enabled: Boolean(body.commentFilter.enabled),
      keywords: Array.isArray(body.commentFilter.keywords)
        ? body.commentFilter.keywords
            .filter((k) => typeof k === 'string' && k.trim())
            .map((k) => k.trim().toLowerCase())
        : []
    };
  }

  if (body.schedule && typeof body.schedule === 'object') {
    const start = validClock(body.schedule.start) ? body.schedule.start : '09:00';
    const end = validClock(body.schedule.end) ? body.schedule.end : '23:00';
    data.schedule = {
      enabled: Boolean(body.schedule.enabled),
      start,
      end
    };
  }

  return { valid: true, data };
}

/**
 * Validate a backup name parameter.
 * @param {string} name - The backup name
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBackupName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Backup name is required' };
  }

  if (!isValidFilename(name)) {
    return { valid: false, error: 'Invalid backup name — no path separators or .. allowed' };
  }

  return { valid: true };
}

/**
 * Validate a send/dry-run request body.
 * @param {object} body - The request body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSendBody(body) {
  if (body && typeof body === 'object' && body.dry !== undefined) {
    return { valid: true };
  }
  // Accept empty body for send
  return { valid: true };
}

/**
 * Validate a job request body.
 * @param {object} body - The request body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateJobBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  if (!body.name || typeof body.name !== 'string') {
    return { valid: false, error: 'Job name is required' };
  }

  const validJobs = ['probe', 'scrape', 'send', 'scan', 'report', 'login', 'connect'];
  if (!validJobs.includes(body.name)) {
    return { valid: false, error: `Unknown job: ${body.name}` };
  }

  return { valid: true };
}

/**
 * Check if a time string is a valid HH:MM clock value.
 * @param {string} time - The time string
 * @returns {boolean}
 */
function validClock(time) {
  if (!time || typeof time !== 'string') return false;
  return /^\d{2}:\d{2}$/.test(time);
}

module.exports = {
  validateCampaignBody,
  validateConfigBody,
  validateBackupName,
  validateSendBody,
  validateJobBody,
  validClock
};
