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

// ensureData
lib.ensureData();
check('ensureData DATA', fs.existsSync(lib.DATA));
check('ensureData CAMPAIGNS', fs.existsSync(lib.CAMPAIGNS_DIR));

// sanitizeConfig defaults
const d = lib.sanitizeConfig({});
check('default dailyCap=50', d.dailyCap === 50, String(d.dailyCap));
check('default delayMinSec=60', d.delayMinSec === 60);
check('default delayMaxSec=120', d.delayMaxSec === 120);
check('default pauseFail=3', d.pauseOnConsecutiveFailures === 3);
check('default pauseMin=30', d.pauseMinutes === 30);

// sanitizeConfig clamping
check('neg dailyCap to 1', lib.sanitizeConfig({ dailyCap: -5 }).dailyCap === 1);
check('over-max dailyCap to 100', lib.sanitizeConfig({ dailyCap: 999 }).dailyCap === 100);
check('string dailyCap default 50', lib.sanitizeConfig({ dailyCap: 'abc' }).dailyCap === 50);
check(
  'delayMax<delayMin swapped',
  lib.sanitizeConfig({ delayMinSec: 100, delayMaxSec: 10 }).delayMaxSec === 100,
);
check('delayMinSec min=2', lib.sanitizeConfig({ delayMinSec: 0 }).delayMinSec === 2);
check('delayMaxSec max=3600', lib.sanitizeConfig({ delayMaxSec: 9999 }).delayMaxSec === 3600);
check(
  'pauseFail min=1',
  lib.sanitizeConfig({ pauseOnConsecutiveFailures: 0 }).pauseOnConsecutiveFailures === 1,
);
check('pauseMinutes max=600', lib.sanitizeConfig({ pauseMinutes: 9999 }).pauseMinutes === 600);

// sanitizeConfig messages
const sm = lib.sanitizeConfig({
  messages: { openers: ['  ', '', 'valid'], questions: [null, 123, 'q1'] },
});
check(
  'sanitize empty openers',
  sm.messages.openers.length === 1 && sm.messages.openers[0] === 'valid',
);
check(
  'sanitize non-string questions',
  sm.messages.questions.length === 1 && sm.messages.questions[0] === 'q1',
);
check('no messages stays undefined', lib.sanitizeConfig({}).messages === undefined);

// validClock
const vc = lib.sanitizeConfig({
  schedule: { enabled: true, start: '25:99', end: 'abc' },
});
check('invalid clock start defaults', vc.schedule.start === '09:00');
check('invalid clock end defaults', vc.schedule.end === '23:00');
const vc2 = lib.sanitizeConfig({
  schedule: { enabled: true, start: '09:30', end: '23:00' },
});
check('valid clock kept', vc2.schedule.start === '09:30' && vc2.schedule.end === '23:00');
const vc3 = lib.sanitizeConfig({
  schedule: { enabled: true, start: '2:5', end: '8:9' },
});
check('short clock invalid defaults', vc3.schedule.start === '09:00');

// commentFilter
const cf = lib.sanitizeConfig({
  commentFilter: { enabled: true, keywords: ['Hello', 'BUY NOW', '  '] },
});
check('commentFilter enabled', cf.commentFilter.enabled === true);
check(
  'commentFilter keywords lower+trim',
  cf.commentFilter.keywords.length === 2 && cf.commentFilter.keywords[0] === 'hello',
);
check('commentFilter defaults', lib.sanitizeConfig({}).commentFilter.enabled === false);

// generateId
const id1 = lib.generateId();
const id2 = lib.generateId();
check('generateId prefix c_', id1.startsWith('c_'), id1);
check('generateId unique', id1 !== id2);
check('generateId format', /^c_[a-z0-9]+_[a-z0-9]+$/.test(id1), id1);

// detectPlatform
const det = [
  ['https://instagram.com/reel/ABC', 'instagram'],
  ['https://www.instagram.com/p/XYZ/', 'instagram'],
  ['HTTPS://INSTAGRAM.COM/REEL/1', 'instagram'],
  ['https://www.facebook.com/posts/123', 'facebook'],
  ['https://fb.com/page', 'facebook'],
  ['https://fb.watch/abc/', 'facebook'],
  ['https://facebook.com/reel/1', 'facebook'],
  ['https://FB.COM/page', 'facebook'],
  ['', 'instagram'],
  [null, 'instagram'],
  [undefined, 'instagram'],
  ['https://tiktok.com/@user', 'instagram'],
  ['https://youtube.com/watch', 'instagram'],
];
for (const [url, exp] of det) {
  check('detect: ' + (url || 'null'), lib.detectPlatform(url) === exp);
}

// parseCsvText
check('parseCsv basic', lib.parseCsvText('a,b,c\n1,2,3\n').length === 3);
check(
  'parseCsv quoted comma',
  lib.parseCsvText('n,c\nu1,"hello, world"\n')[1][1] === 'hello, world',
);
check('parseCsv escaped quotes', lib.parseCsvText('x\n"s""hi"""\n')[1][0] === 's"hi"');
check('parseCsv newline in quote', lib.parseCsvText('x\n"l1\nl2"\n')[1][0] === 'l1\nl2');
check('parseCsv empty', lib.parseCsvText('').length === 1);
check(
  'parseCsv mixed endings',
  lib.parseCsvText('a,b\nc,d\r\ne,f\r\n').length === 4,
);

// escCsv
check('escCsv plain', lib.escCsv('hello') === 'hello');
check('escCsv comma', lib.escCsv('a,b') === '"a,b"');
check('escCsv quote', lib.escCsv('a"b') === '"a""b"');
check('escCsv newline', lib.escCsv('a\nb') === '"a\nb"');
check('escCsv undefined', lib.escCsv(undefined) === '');
check('escCsv null', lib.escCsv(null) === '');
check('escCsv number', lib.escCsv(42) === '42');

// nowIso / todayKey
const ni = lib.nowIso();
check(
  'nowIso format',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(ni),
  ni,
);
const tk = lib.todayKey();
check('todayKey format', /^\d{4}-\d{2}-\d{2}$/.test(tk));
check('todayKey = nowIso prefix', tk === ni.slice(0, 10));

// Campaign CRUD
const c1 = lib.createCampaign('Test CRUD', 'instagram', 'https://instagram.com/reel/1');
check('create returns id+draft', c1.id && c1.status === 'draft');
check('create platform', c1.platform === 'instagram');
for (const f of [
  'campaign.json',
  'commenters.csv',
  'sent.csv',
  'already-contacted.csv',
  'replied.csv',
]) {
  check('create file: ' + f, fs.existsSync(path.join(lib.DATA, 'campaigns', c1.id, f)));
}
const l1 = lib.loadCampaign(c1.id);
check('load name', l1 && l1.name === 'Test CRUD');
check('load platform', l1.platform === 'instagram');
l1.status = 'running';
l1.text1 = [
  { id: 'm1', content: 'msg1' },
  { id: 'm2', content: 'msg2' },
];
l1.followups = [{ id: 'f1', content: 'fup1' }];
lib.saveCampaign(l1);
const l2 = lib.loadCampaign(c1.id);
check('save obj status', l2.status === 'running');
check('save obj text1 len', l2.text1.length === 2);
lib.saveCampaign(c1.id, { status: 'paused', dailyCap: 25 });
const l3 = lib.loadCampaign(c1.id);
check('save patch status', l3.status === 'paused');
check('save patch dailyCap', l3.dailyCap === 25);
check('save nonexistent', lib.saveCampaign('nonexistent_xyz', { status: 'x' }) === null);
check('save null', lib.saveCampaign(null) === null);
check('save number', lib.saveCampaign(123) === null);
check('save string no patch', lib.saveCampaign('nonexistent_xyz') === null);
check('list has campaign', lib.listCampaigns().some((c) => c.id === c1.id));
lib.deleteCampaign(c1.id);
check('delete removes load', lib.loadCampaign(c1.id) === null);
check(
  'delete removes from list',
  !lib.listCampaigns().find((c) => c.id === c1.id),
);
check('delete nonexistent true', lib.deleteCampaign('nonexistent_xyz') === true);

// activeCampaign reset on delete
const ca = lib.createCampaign('A', 'instagram');
const cb = lib.createCampaign('B', 'instagram');
lib.saveCampaign(ca.id, { status: 'idle' });
lib.saveCampaign(cb.id, { status: 'idle' });
const cfg = lib.loadConfig();
cfg.activeCampaign = ca.id;
fs.writeFileSync(lib.CONFIG_PATH, JSON.stringify(cfg, null, 2));
lib.deleteCampaign(ca.id);
check('delete resets active', lib.loadConfig().activeCampaign === cb.id);

// CSV roundtrip
const ct = lib.createCampaign('CSV Test', 'instagram');
lib.writeCsv(
  'commenters.csv',
  [
    { username: 'alice', comment: 'Great!', commented_at: '2025-01-01T00:00:00.000Z' },
    { username: 'bob', comment: 'Love!', commented_at: '2025-01-02T00:00:00.000Z' },
  ],
  ct.id,
);
const cr = lib.readCsv('commenters.csv', ct.id);
check('CSV write/read count', cr.length === 2);
check('CSV write/read row0', cr[0].username === 'alice' && cr[0].comment === 'Great!');
lib.appendCsv('sent.csv', { username: 'alice', sent_at: '2025-01-01' }, ct.id);
lib.appendCsv('sent.csv', { username: 'bob', sent_at: '2025-01-02' }, ct.id);
check('CSV append', lib.readCsv('sent.csv', ct.id).length === 2);
lib.writeCsv('sent.csv', [], ct.id);
check('CSV empty write', lib.readCsv('sent.csv', ct.id).length === 0);
lib.writeCsv(
  'commenters.csv',
  [{ username: 'u,1', comment: 'He said "hi"', commented_at: '' }],
  ct.id,
);
const sc = lib.readCsv('commenters.csv', ct.id);
check('CSV special chars', sc[0].username === 'u,1' && sc[0].comment === 'He said "hi"');
lib.writeCsv(
  'commenters.csv',
  [{ username: 'user_test', comment: 'test', commented_at: '' }],
  ct.id,
);
const uc = lib.readCsv('commenters.csv', ct.id);
check('CSV underscores', uc[0].username === 'user_test');
check('readCsv nonexistent', lib.readCsv('nope.csv', ct.id).length === 0);

// campaignDataPath
const dp = lib.campaignDataPath('x', 'f.csv');
check('campaignDataPath', dp.includes('campaigns') && dp.includes('x') && dp.endsWith('f.csv'));

// loadConfig sanitizes corrupted values
fs.writeFileSync(lib.CONFIG_PATH, JSON.stringify({ dailyCap: -10, delayMinSec: 99999 }));
const cl = lib.loadConfig();
check('loadConfig sanitizes', cl.dailyCap === 1 && cl.delayMinSec === 3600);

// clearSession
fs.mkdirSync(lib.DATA, { recursive: true });
fs.writeFileSync(path.join(lib.DATA, '.logged-in'), 'test');
check('clearSession returns true', lib.clearSession() === true);
check('clearSession removes marker', !fs.existsSync(path.join(lib.DATA, '.logged-in')));
lib.clearSession();

// listCampaigns cleans orphans
const orphan = lib.createCampaign('Orphan', 'instagram');
fs.rmSync(path.join(lib.DATA, 'campaigns', orphan.id), { recursive: true, force: true });
const before = lib.loadConfig().campaigns.length;
lib.listCampaigns();
check('listCampaigns cleans orphans', lib.loadConfig().campaigns.length < before);

// Clean up
for (const c of lib.listCampaigns()) {
  lib.deleteCampaign(c.id);
}

console.log('\n=== lib.js: ' + P + ' passed, ' + F + ' failed ===');
if (F > 0) process.exit(1);
