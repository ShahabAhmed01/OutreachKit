'use strict';

const fs = require('fs');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowIso() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}` +
    `${sign}${oh}:${om}`
  );
}

function todayKey() {
  return nowIso().slice(0, 10);
}

function log(level, msg) {
  console.log(`[${level}] ${msg}`);
}

const info = (m) => log('info', m);
const ok = (m) => log('ok', m);
const warn = (m) => log('warn', m);
const err = (m) => log('err', m);
const step = (m) => log('step', m);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stopSleep(ms, flagPath) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (flagPath && fs.existsSync(flagPath)) return true;
    await sleep(1000);
  }
  return false;
}

module.exports = {
  pad2,
  nowIso,
  todayKey,
  log,
  info,
  ok,
  warn,
  err,
  step,
  sleep,
  stopSleep
};
