'use strict';

const lib = require('../src/lib');
const fs = require('fs');
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

// ═══════════════════════════════════════
// CORRUPT CONFIG
// ═══════════════════════════════════════
const origCfg = fs.readFileSync(lib.CONFIG_PATH, 'utf8');

fs.writeFileSync(lib.CONFIG_PATH, '');
const c1 = lib.loadConfig();
check('corrupt config: empty file defaults', c1.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, '{invalid json!!!');
const c2 = lib.loadConfig();
check('corrupt config: invalid JSON defaults', c2.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, '{"dailyCap":');
const c3 = lib.loadConfig();
check('corrupt config: partial JSON defaults', c3.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, '"just a string"');
const c4 = lib.loadConfig();
check('corrupt config: string defaults', c4.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, '[1,2,3]');
const c5 = lib.loadConfig();
check('corrupt config: array defaults', c5.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, 'null');
const c6 = lib.loadConfig();
check('corrupt config: null defaults', c6.dailyCap === 50);

fs.writeFileSync(lib.CONFIG_PATH, origCfg);

// ═══════════════════════════════════════
// CORRUPT CAMPAIGN JSON
// ═══════════════════════════════════════
const testCamp = lib.createCampaign('Corrupt Test', 'instagram');
const campDir = path.join(lib.DATA, 'campaigns', testCamp.id);

fs.writeFileSync(path.join(campDir, 'campaign.json'), '{bad');
const loaded = lib.loadCampaign(testCamp.id);
check('corrupt campaign.json returns null', loaded === null);

fs.writeFileSync(path.join(campDir, 'campaign.json'), '');
const loaded2 = lib.loadCampaign(testCamp.id);
check('empty campaign.json returns null', loaded2 === null);

const loaded3 = lib.loadCampaign('totally_nonexistent_id');
check('missing campaign dir returns null', loaded3 === null);

// ═══════════════════════════════════════
// CORRUPT CSV FILES
// ═══════════════════════════════════════
fs.writeFileSync(path.join(campDir, 'commenters.csv'), 'not,a,valid\ncsv"file\n');
const csv1 = lib.readCsv('commenters.csv', testCamp.id);
check('corrupt CSV parsed ok', csv1.length >= 1);
check('corrupt CSV row0', csv1[0] !== undefined);

fs.writeFileSync(path.join(campDir, 'commenters.csv'), '');
const csv2 = lib.readCsv('commenters.csv', testCamp.id);
check('empty CSV returns []', csv2.length === 0);

fs.writeFileSync(path.join(campDir, 'commenters.csv'), 'username,comment\n');
const csv3 = lib.readCsv('commenters.csv', testCamp.id);
check('header-only CSV returns []', csv3.length === 0);

// ═══════════════════════════════════════
// MISSING DATA DIR
// ═══════════════════════════════════════
const csv4 = lib.readCsv('nonexistent.csv');
check('readCsv no data dir returns []', csv4.length === 0);

// ═══════════════════════════════════════
// EXTREME VALUES
// ═══════════════════════════════════════
check('sanitize dailyCap=1 min', lib.sanitizeConfig({ dailyCap: 1 }).dailyCap === 1);
check('sanitize dailyCap=100 max', lib.sanitizeConfig({ dailyCap: 100 }).dailyCap === 100);
check('sanitize dailyCap=0 goes to 1', lib.sanitizeConfig({ dailyCap: 0 }).dailyCap === 1);
check('sanitize dailyCap=101 goes to 100', lib.sanitizeConfig({ dailyCap: 101 }).dailyCap === 100);
check('sanitize delayMinSec=2 min', lib.sanitizeConfig({ delayMinSec: 2 }).delayMinSec === 2);
check(
  'sanitize delayMaxSec=3600 max',
  lib.sanitizeConfig({ delayMaxSec: 3600 }).delayMaxSec === 3600
);

check('sanitize NaN dailyCap', lib.sanitizeConfig({ dailyCap: NaN }).dailyCap === 50);
check('sanitize Infinity dailyCap', lib.sanitizeConfig({ dailyCap: Infinity }).dailyCap === 50);
check('sanitize undefined dailyCap', lib.sanitizeConfig({ dailyCap: undefined }).dailyCap === 50);
check('sanitize null dailyCap', lib.sanitizeConfig({ dailyCap: null }).dailyCap === 1);

// ═══════════════════════════════════════
// LARGE CSV
// ═══════════════════════════════════════
const bigRows = [];
for (let i = 0; i < 1000; i++) {
  bigRows.push({
    username: 'user_' + i,
    comment: 'Comment #' + i + ' with "quotes" and, commas',
    commented_at: new Date().toISOString()
  });
}
lib.writeCsv('commenters.csv', bigRows, testCamp.id);
const bigCsv = lib.readCsv('commenters.csv', testCamp.id);
check('large CSV 1000 rows', bigCsv.length === 1000);
check('large CSV row 999', bigCsv[999].username === 'user_999');
check(
  'large CSV special chars preserved',
  bigCsv[0].comment.includes('"quotes"') && bigCsv[0].comment.includes(', commas')
);

// ═══════════════════════════════════════
// MULTIPLE CAMPAIGNS ISOLATION
// ═══════════════════════════════════════
const cA = lib.createCampaign('Isolation A', 'instagram');
const cB = lib.createCampaign('Isolation B', 'facebook');
lib.writeCsv(
  'commenters.csv',
  [{ username: 'a_user', comment: 'from A', commented_at: '' }],
  cA.id
);
lib.writeCsv(
  'commenters.csv',
  [{ username: 'b_user', comment: 'from B', commented_at: '' }],
  cB.id
);
check('isolation A', lib.readCsv('commenters.csv', cA.id).length === 1);
check('isolation B', lib.readCsv('commenters.csv', cB.id).length === 1);
check('isolation A user', lib.readCsv('commenters.csv', cA.id)[0].username === 'a_user');
check('isolation B user', lib.readCsv('commenters.csv', cB.id)[0].username === 'b_user');

lib.writeCsv('commenters.csv', [{ username: 'a2', comment: 'new A', commented_at: '' }], cA.id);
check(
  'overwrite A',
  lib.readCsv('commenters.csv', cA.id).length === 1 &&
    lib.readCsv('commenters.csv', cA.id)[0].username === 'a2'
);
check('B untouched', lib.readCsv('commenters.csv', cB.id)[0].username === 'b_user');

// ═══════════════════════════════════════
// SAVECAMPAIGN IDEMPOTENCY
// ═══════════════════════════════════════
const cI = lib.createCampaign('Idempotent', 'instagram');
const orig = lib.loadCampaign(cI.id);
orig.status = 'running';
lib.saveCampaign(cI.id, { status: 'running' });
const after1 = lib.loadCampaign(cI.id);
lib.saveCampaign(cI.id, { status: 'running' });
const after2 = lib.loadCampaign(cI.id);
check('idempotent save', after1.status === after2.status && after1.status === 'running');

// ═══════════════════════════════════════
// DOUBLE DELETE
// ═══════════════════════════════════════
const cD = lib.createCampaign('Double Del', 'instagram');
lib.deleteCampaign(cD.id);
check('double delete 1st', lib.loadCampaign(cD.id) === null);
check('double delete 2nd', lib.deleteCampaign(cD.id) === true);
check('double delete still gone', lib.loadCampaign(cD.id) === null);

// ═══════════════════════════════════════
// PLATFORM DETECTION COMPREHENSIVE
// ═══════════════════════════════════════
const platforms = [
  ['https://instagram.com/reel/ABC', 'instagram'],
  ['https://www.instagram.com/p/XYZ/', 'instagram'],
  ['https://m.instagram.com/story/123', 'instagram'],
  ['http://instagram.com/', 'instagram'],
  ['HTTPS://INSTAGRAM.COM/', 'instagram'],
  ['https://www.facebook.com/posts/123', 'facebook'],
  ['https://m.facebook.com/page', 'facebook'],
  ['https://web.facebook.com/posts/1', 'facebook'],
  ['https://fb.com/page', 'facebook'],
  ['https://fb.watch/abc/', 'facebook'],
  ['https://facebook.com/reel/1', 'facebook'],
  ['HTTPS://FB.COM/PAGE', 'facebook'],
  ['', 'instagram'],
  [null, 'instagram'],
  [undefined, 'instagram'],
  [0, 'instagram'],
  [false, 'instagram'],
  ['https://tiktok.com/@user', 'instagram'],
  ['https://youtube.com/watch', 'instagram'],
  ['linkedin.com/posts/123', 'instagram'],
  ['random text with instagram.com inside', 'instagram'],
  ['https://instagram.com', 'instagram'],
  ['https://fb.com', 'facebook']
];
for (const [url, exp] of platforms) {
  const got = lib.detectPlatform(url);
  check('platform: ' + JSON.stringify(url), got === exp, 'got=' + got);
}

// Clean up
for (const c of lib.listCampaigns()) {
  lib.deleteCampaign(c.id);
}

console.log('\n=== EDGE CASES: ' + P + ' passed, ' + F + ' failed ===');
if (F > 0) process.exit(1);
