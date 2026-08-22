'use strict';

const fs = require('fs');
const path = require('path');
const { ensureData, DATA } = require('./config');

function campaignDataPath(id, file) {
  const campaignsDir = path.join(DATA, 'campaigns');
  return path.join(campaignsDir, id, file);
}

function atomicWrite(p, text) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQ = false;
          i++;
        }
      } else {
        cur += c;
        i++;
      }
    } else if (c === '"') {
      inQ = true;
      i++;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
      i++;
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

function escCsv(v) {
  const s = String(v === undefined || v === null ? '' : v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function readCsv(file, campaignId) {
  ensureData();
  const p = campaignId ? campaignDataPath(campaignId, file) : path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  const lines = parseCsvText(fs.readFileSync(p, 'utf8')).filter((r) =>
    r.some((cell) => String(cell === undefined || cell === null ? '' : cell).trim() !== '')
  );
  if (lines.length < 2) return [];
  const head = lines[0].map((h) => String(h).trim());
  return lines.slice(1).map((row) => {
    const o = {};
    head.forEach((h, i) => {
      if (!h) return;
      o[h] = String(row[i] === undefined || row[i] === null ? '' : row[i]).trim();
    });
    return o;
  });
}

function writeCsv(file, rows, campaignId) {
  ensureData();
  const p = campaignId ? campaignDataPath(campaignId, file) : path.join(DATA, file);
  if (!rows.length) {
    atomicWrite(p, '');
    return;
  }
  const head = Object.keys(rows[0]);
  const body = rows.map((r) => head.map((h) => escCsv(r[h])).join(','));
  atomicWrite(p, [head.join(','), ...body].join('\n') + '\n');
}

function appendCsv(file, row, campaignId) {
  ensureData();
  const existing = readCsv(file, campaignId);
  existing.push(row);
  writeCsv(file, existing, campaignId);
}

module.exports = {
  parseCsvText,
  escCsv,
  readCsv,
  writeCsv,
  appendCsv,
  atomicWrite,
  campaignDataPath
};
