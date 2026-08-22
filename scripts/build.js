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
for (const f of [
  'package.json',
  'package-lock.json',
  'config.json',
  'start.bat',
  'start.sh',
  'README.md',
  '.gitignore'
]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f));
}
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'profile'), { recursive: true });

// Ensure the Linux launcher is executable in dist
const distSh = path.join(OUT, 'start.sh');
if (fs.existsSync(distSh)) fs.chmodSync(distSh, 0o755);

// Copy campaigns directory if it exists
if (fs.existsSync(CAMPAIGNS_DIR)) {
  copyDir(CAMPAIGNS_DIR, path.join(OUT, 'data', 'campaigns'));
}

// Archive the dist folder. `zip` is preferred (GNU tar cannot write zip archives).
try {
  const zip = path.join(DIST, `${NAME}.zip`);
  execFileSync('zip', ['-r', '-q', zip, NAME], { cwd: DIST, stdio: 'pipe' });
  console.log('ZIP created: ' + zip);
} catch {
  try {
    const tgz = path.join(DIST, `${NAME}.tar.gz`);
    execFileSync('tar', ['-czf', tgz, NAME], { cwd: DIST, stdio: 'pipe' });
    console.log('TAR.GZ created: ' + tgz);
  } catch (e) {
    console.log('Archive failed: ' + String(e.message || e).split('\n')[0]);
  }
}

if (process.env.OUTREACHKIT_BUILD_EXE === '1') {
  const target =
    process.env.OUTREACHKIT_TARGET ||
    (process.platform === 'win32' ? 'node24-win-x64' : 'node24-linux-x64');
  const binName = process.platform === 'win32' ? 'OutreachKit.exe' : 'outreachkit';
  try {
    execFileSync(
      'npx',
      [
        '@yao-pkg/pkg',
        'gui/server.js',
        '--targets',
        target,
        '--config',
        path.join(ROOT, 'scripts', 'pkg-config.json'),
        '--output',
        path.join(OUT, binName)
      ],
      { cwd: ROOT, stdio: 'inherit' }
    );
    console.log('Binary created: ' + path.join(OUT, binName));
  } catch (e) {
    console.log(
      'Binary build skipped (pkg not installed or failed): ' + String(e.message || e).split('\n')[0]
    );
  }
}

console.log('Dist ready: ' + OUT);
