'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CAMPAIGNS_DIR = path.join(ROOT, 'data', 'campaigns');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = `outreachkit-${pkg.version}`;
const OUT = path.join(DIST, NAME);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name);
    const d = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(path.join(ROOT, 'src'), path.join(OUT, 'src'));
copyDir(path.join(ROOT, 'gui'), path.join(OUT, 'gui'));
copyDir(path.join(ROOT, 'test'), path.join(OUT, 'test'));
for (const f of ['package.json', 'package-lock.json', 'config.json', 'start.bat', 'README.md', '.gitignore']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f));
}
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'profile'), { recursive: true });

// Copy campaigns directory if it exists
if (fs.existsSync(CAMPAIGNS_DIR)) {
  copyDir(CAMPAIGNS_DIR, path.join(OUT, 'data', 'campaigns'));
}

const zip = path.join(DIST, `${NAME}.zip`);
try {
  execFileSync('tar', ['-a', '-c', '-f', zip, NAME], { cwd: DIST, stdio: 'pipe' });
  console.log('ZIP created: ' + zip);
} catch (e) {
  console.log('ZIP failed: ' + String(e.message || e).split('\n')[0]);
}

if (process.env.OUTREACHKIT_BUILD_EXE === '1') {
  try {
    execFileSync('npx', ['@yao-pkg/pkg', 'gui/server.js', '--targets', 'node24-win-x64', '--config', path.join(ROOT, 'scripts', 'pkg-config.json'), '--output', path.join(OUT, 'OutreachKit.exe')], { cwd: ROOT, stdio: 'inherit' });
    console.log('EXE created: ' + path.join(OUT, 'OutreachKit.exe'));
  } catch (e) {
    console.log('EXE build skipped (pkg not installed or failed): ' + String(e.message || e).split('\n')[0]);
  }
}

console.log('Dist ready: ' + OUT);
