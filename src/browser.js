'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { PROFILE, ensureData } = require('./config');

const WIN_CANDIDATES = [
  { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', channel: 'chrome' },
  { path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', channel: 'chrome' },
  {
    path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    channel: 'msedge'
  },
  { path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', channel: 'msedge' }
];

const LINUX_BINS = [
  ['google-chrome-stable', 'chrome'],
  ['google-chrome', 'chrome'],
  ['chrome', 'chrome'],
  ['microsoft-edge-stable', 'msedge'],
  ['microsoft-edge', 'msedge'],
  ['brave-browser', 'chrome'],
  ['chromium', null],
  ['chromium-browser', null]
];

function whichBin(bin) {
  try {
    return execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

function findChannel() {
  if (process.platform === 'win32') {
    const hit = WIN_CANDIDATES.find((c) => fs.existsSync(c.path));
    return hit ? hit.channel : null;
  }
  if (process.platform === 'linux' || process.platform === 'darwin') {
    for (const [bin, channel] of LINUX_BINS) {
      if (whichBin(bin)) return channel;
    }
  }
  return null;
}

function launch(headless) {
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
    await p
      .goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {});
    apiPages.set(ctx, p);
  }
  return p;
}

async function apiGet(ctx, url) {
  const p = await apiPage(ctx);
  const r = await p.evaluate(async (u) => {
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
      throw new Error(
        j.message === 'login_required' || j.message === 'Not Authorized'
          ? 'SESSION_EXPIRED'
          : `API error: ${j.message}`
      );
    }
  }
  return j;
}

async function apiPost(ctx, url, body) {
  const p = await apiPage(ctx);
  const r = await p.evaluate(
    async ({ url: targetUrl, body: postData }) => {
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'x-ig-app-id': '936619743392459',
            'x-requested-with': 'XMLHttpRequest',
            accept: 'application/json, text/plain, */*'
          },
          credentials: 'include',
          body: postData
        });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: 0, text: 'NETWORK_ERROR ' + e.message };
      }
    },
    { url, body }
  );
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
      throw new Error(
        j.message === 'login_required' || j.message === 'Not Authorized'
          ? 'SESSION_EXPIRED'
          : `API error: ${j.message}`
      );
    }
  }
  return j;
}

module.exports = {
  launch,
  apiGet,
  apiPost,
  getUA,
  apiPage
};
