'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

let P = 0;
let F = 0;
function ok(_label) {
  P++;
}
function fail(label, msg) {
  F++;
  console.error('FAIL [' + label + ']: ' + msg);
}
function check(label, cond, msg) {
  if (cond) ok(label);
  else fail(label, msg || String(cond));
}

function req(method, urlPath, body, timeout) {
  timeout = timeout || 3000;
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method,
      headers: {},
      timeout
    };
    if (body) opts.headers['Content-Type'] = 'application/json';
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode, body: data, json });
      });
    });
    r.on('error', () => resolve({ status: 0, body: '', json: null }));
    r.on('timeout', () => {
      r.destroy();
      resolve({ status: 0, body: 'TIMEOUT', json: null });
    });
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, OUTREACHKIT_NO_OPEN: '1', PORT: '3000' },
    stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 2000));

  try {
    // Static files
    let r;
    r = await req('GET', '/');
    check('GET / 200', r.status === 200);
    check('GET / has html', r.body.includes('<!DOCTYPE') || r.body.includes('<html'));
    r = await req('GET', '/app.css');
    check('GET /app.css 200', r.status === 200);
    r = await req('GET', '/app.js');
    check('GET /app.js 200', r.status === 200);
    r = await req('GET', '/nonexistent.html');
    check('GET /nonexistent.html 404', r.status === 404);

    // SSE (with short timeout since it streams)
    r = await req('GET', '/events', null, 1500);
    check('GET /events 200 or stream', r.status === 200 || r.status === 0);

    // Dashboard
    r = await req('GET', '/api/dashboard');
    check('GET /api/dashboard 200', r.status === 200);
    check('dashboard has config', r.json && r.json.config !== undefined);
    r = await req('GET', '/api/status');
    check('GET /api/status 200', r.status === 200);

    // Config
    r = await req('GET', '/api/config');
    check('GET /api/config 200', r.status === 200);
    check('config has dailyCap', r.json && r.json.dailyCap !== undefined);
    r = await req('POST', '/api/config', { dailyCap: 75 });
    check('POST /api/config 200', r.status === 200);
    r = await req('GET', '/api/config');
    check('config persists', r.json && r.json.dailyCap === 75);
    r = await req('POST', '/api/config', 'not json');
    check('POST /api/config bad JSON = 400', r.status === 400);
    await req('POST', '/api/config', { dailyCap: 50 });

    // Leads legacy
    r = await req('GET', '/api/leads');
    check('GET /api/leads 200', r.status === 200);
    check('leads array', Array.isArray(r.json));
    r = await req('GET', '/api/leads?status=new&q=test&limit=5');
    check('leads with params 200', r.status === 200);

    // Campaigns
    r = await req('GET', '/api/campaigns');
    check('GET /api/campaigns 200', r.status === 200);
    check('campaigns array', Array.isArray(r.json));

    r = await req('POST', '/api/campaigns', {
      name: 'API Test',
      url: 'https://instagram.com/reel/1',
      text1: ['Hey {username}']
    });
    check('create campaign 201', r.status === 201);
    check('campaign has id', r.json && r.json.id);
    const cid = r.json.id;

    r = await req('GET', '/api/campaigns/' + cid);
    check('get campaign 200', r.status === 200);
    check('campaign name', r.json && r.json.name === 'API Test');
    check('campaign has stats', r.json && r.json.stats !== undefined);

    r = await req('GET', '/api/campaigns/' + cid + '/leads');
    check('campaign leads 200', r.status === 200);
    check('leads array', Array.isArray(r.json));

    r = await req('GET', '/api/campaigns/' + cid + '/leads?status=new');
    check('campaign leads filtered 200', r.status === 200);

    // Validation
    r = await req('POST', '/api/campaigns', { name: 'Test' });
    check('no url = 400', r.status === 400);
    r = await req('POST', '/api/campaigns', { url: 'https://ig.com/x' });
    check('no name = 400', r.status === 400);
    r = await req('POST', '/api/campaigns', 'bad');
    check('bad JSON = 400', r.status === 400);

    // Not found
    r = await req('GET', '/api/campaigns/nonexistent');
    check('get nonexistent 404', r.status === 404);
    r = await req('GET', '/api/campaigns/nonexistent/leads');
    check('leads nonexistent 404', r.status === 404);

    // Scrape
    r = await req('POST', '/api/campaigns/' + cid + '/scrape');
    check('scrape 200', r.status === 200);
    check('scrape ok', r.json && r.json.ok);
    // Wait for the scrape job to actually finish (it launches a real browser),
    // otherwise a concurrent job blocks the subsequent /start call.
    let scraped = false;
    for (let i = 0; i < 30 && !scraped; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      const s = await req('GET', '/api/campaigns/' + cid);
      if (s.json && s.json.status !== 'scraping') scraped = true;
    }
    check('scrape finished', scraped);

    // Start
    r = await req('POST', '/api/campaigns/' + cid + '/start');
    check('start 200', r.status === 200);
    await new Promise((res) => setTimeout(res, 500));

    // Pause
    r = await req('POST', '/api/campaigns/' + cid + '/pause');
    check('pause 200', r.status === 200);
    r = await req('GET', '/api/campaigns/' + cid);
    check('pause sets status', r.json && r.json.status === 'paused');

    // Delete
    r = await req('DELETE', '/api/campaigns/' + cid);
    check('delete 200', r.status === 200);
    r = await req('GET', '/api/campaigns/' + cid);
    check('deleted gone', r.status === 404);
    r = await req('DELETE', '/api/campaigns/nonexistent');
    check('delete nonexistent ok', r.status === 200);

    // Legacy job
    r = await req('POST', '/api/job', { name: 'probe' });
    check('job probe 200', r.status === 200);
    r = await req('POST', '/api/job', { name: 'unknown' });
    check('job unknown 400', r.status === 400);
    r = await req('POST', '/api/job', 'bad');
    check('job bad JSON 400', r.status === 400);

    // Send API
    r = await req('POST', '/api/send', { dry: true });
    check('send dry 200', r.status === 200);
    r = await req('POST', '/api/send', 'bad');
    check('send bad JSON 400', r.status === 400);

    // Stop
    r = await req('POST', '/api/stop');
    check('stop 200', r.status === 200);

    // Log
    r = await req('GET', '/api/log');
    check('log 200', r.status === 200);
    check('log array', Array.isArray(r.json));
    r = await req('GET', '/api/log?n=5');
    check('log n=5 200', r.status === 200);

    // Backup/Restore
    r = await req('POST', '/api/backup');
    check('backup 200', r.status === 200);
    check('backup ok', r.json && r.json.ok);
    const bakName = r.json.name;

    r = await req('GET', '/api/backups');
    check('backups 200', r.status === 200);
    check('backups has entry', r.json && r.json.length > 0);

    r = await req('POST', '/api/restore', { name: bakName });
    check('restore 200', r.status === 200);
    r = await req('POST', '/api/restore', { name: '../etc/passwd' });
    check('restore bad name 400', r.status === 400);
    r = await req('POST', '/api/restore', { name: 'nonexistent' });
    check('restore not found 400', r.status === 400);
    r = await req('POST', '/api/restore', 'bad');
    check('restore bad JSON 400', r.status === 400);

    // 404 catch-all
    r = await req('GET', '/api/unknown');
    check('unknown GET 404', r.status === 404);
    r = await req('POST', '/api/unknown');
    check('unknown POST 404', r.status === 404);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n=== SERVER API: ' + P + ' passed, ' + F + ' failed ===');
  if (F > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
