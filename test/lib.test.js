'use strict';

const assert = require('assert');
const lib = require('../src/lib');

const parsed = lib.parseCsvText('a,b\n"x,y","say ""hi""\nnext"\nc,d');
assert.strictEqual(parsed.length, 3);
assert.strictEqual(parsed[0].join('|'), 'a|b');
assert.strictEqual(parsed[1][0], 'x,y');
assert.strictEqual(parsed[1][1], 'say "hi"\nnext');
assert.strictEqual(parsed[2].join('|'), 'c|d');

const body = [
  'h1,h2',
  `${lib.escCsv('comma,here')},X`,
  `${lib.escCsv('state"q"uote')},Y`,
  `${lib.escCsv('line\nbreak')},Z`,
  'plain,W'
].join('\n');
const rt = lib.parseCsvText(body);
assert.strictEqual(rt.length, 5);
assert.strictEqual(rt[1][0], 'comma,here');
assert.strictEqual(rt[2][0], 'state"q"uote');
assert.strictEqual(rt[3][0], 'line\nbreak');
assert.strictEqual(rt[3][1], 'Z');
assert.strictEqual(rt[4].join('|'), 'plain|W');
assert.deepStrictEqual(rt.map((r) => r[1]).slice(1, 5), ['X', 'Y', 'Z', 'W']);

const cfg = lib.sanitizeConfig({
  dailyCap: 9999,
  delayMinSec: -5,
  delayMaxSec: 99999,
  messages: { openers: ['  A  ', '', 3, 'B'], questions: [] },
  commentFilter: { enabled: true, keywords: ['  CRM  ', '', 'soFtWare'] },
  schedule: { enabled: true, start: '25:00', end: '22:30' }
});
assert.strictEqual(cfg.dailyCap, 100);
assert.strictEqual(cfg.delayMinSec, 2);
assert.strictEqual(cfg.delayMaxSec, 3600);
assert.deepStrictEqual(cfg.messages.openers, ['A', 'B']);
assert.strictEqual(cfg.messages.questions.length, 1);
assert.deepStrictEqual(cfg.commentFilter.keywords, ['crm', 'software']);
assert.strictEqual(cfg.schedule.start, '09:00');
assert.strictEqual(cfg.schedule.end, '22:30');

const key = lib.todayKey();
assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
const iso = lib.nowIso();
assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
const local = new Date();
assert.strictEqual(
  key,
  `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
);

console.log('ALL LIB TESTS PASSED');
