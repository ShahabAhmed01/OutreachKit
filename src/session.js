'use strict';

const fs = require('fs');
const { launch, PROFILE, ok, warn } = require('./lib');

(async () => {
  const result = { loggedIn: false, reason: '' };
  if (!fs.existsSync(PROFILE) || fs.readdirSync(PROFILE).length === 0) {
    result.reason = 'no-profile';
    warn('No saved profile yet — run Connect first.');
    console.log('RESULT:' + JSON.stringify(result));
    return;
  }

  let ctx = null;
  try {
    ok('Probing saved session…');
    ctx = await launch(true);
    const page = await ctx.newPage();
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    if (page.url().includes('accounts/login')) {
      result.reason = 'login-redirect';
    } else {
      const inboxLink = await page.$('a[href*="/direct/inbox"]').catch(() => null);
      if (inboxLink) {
        result.loggedIn = true;
        ok('Session is valid — you are logged in.');
      } else {
        result.reason = 'no-inbox-link';
        warn('Logged-in state could not be confirmed — the page may still be loading.');
      }
    }
  } catch (e) {
    result.reason = 'error';
    result.detail = e.message.split('\n')[0];
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    console.log('RESULT:' + JSON.stringify(result));
  }
})();