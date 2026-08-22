'use strict';

const fs = require('fs');
const path = require('path');
const { launch, DATA, info, ok, err } = require('./lib');

(async () => {
  let detected = false;
  const ctx = await launch(false);
  const page = await ctx.newPage();

  try {
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch {}

  info('Browser opened. Log in to your business account, then close the window when done.');

  const poll = setInterval(async () => {
    if (detected || page.isClosed()) return;
    try {
      const el = await page.$('a[href*="/direct/inbox"]');
      if (el) {
        detected = true;
        fs.writeFileSync(path.join(DATA, '.logged-in'), String(Date.now()));
        ok('Login detected — session saved. You can close the window now.');
      }
    } catch {}
  }, 2000);

  await new Promise((r) => ctx.on('close', r));
  clearInterval(poll);

  if (!detected) {
    err('Window was closed before a login was detected — please try again.');
    process.exit(1);
  }
  process.exit(0);
})();
