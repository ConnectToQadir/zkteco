'use strict';

/**
 * Compiles installer/PunchType.iss with Inno Setup (Windows).
 * Produces: release/PunchType-Setup-1.0.0.exe  ← upload this to your website
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ISS = path.join(ROOT, 'installer', 'PunchType.iss');
const DIST_EXE = path.join(ROOT, 'dist', 'PunchType.exe');
const RELEASE_DIR = path.join(ROOT, 'release');

function findIscc() {
  const candidates = [
    process.env.INNO_SETUP_ISCC,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function main() {
  if (process.platform !== 'win32') {
    // eslint-disable-next-line no-console
    console.error('build:installer must run on Windows (Inno Setup).');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(DIST_EXE)) {
    // eslint-disable-next-line no-console
    console.error('Missing dist\\PunchType.exe');
    // eslint-disable-next-line no-console
    console.error('Run first: npm run build');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(path.join(ROOT, 'dist', 'public', 'index.html'))) {
    // eslint-disable-next-line no-console
    console.error('Missing dist\\public — run: npm run build');
    process.exitCode = 1;
    return;
  }

  const iscc = findIscc();
  if (!iscc) {
    // eslint-disable-next-line no-console
    console.error('Inno Setup 6 not found.');
    // eslint-disable-next-line no-console
    console.error('Install from: https://jrsoftware.org/isinfo.php');
    // eslint-disable-next-line no-console
    console.error('Or set INNO_SETUP_ISCC to ISCC.exe path, then retry.');
    // eslint-disable-next-line no-console
    console.error('You can also open installer\\PunchType.iss in Inno Setup and click Compile.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // eslint-disable-next-line no-console
  console.log('Compiling installer with:', iscc);
  const result = spawnSync(iscc, [ISS], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    // eslint-disable-next-line no-console
    console.error('Inno Setup compile failed.');
    process.exitCode = result.status || 1;
    return;
  }

  const setup = path.join(RELEASE_DIR, 'PunchType-Setup-1.0.0.exe');
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('SUCCESS — upload this file to your website:');
  // eslint-disable-next-line no-console
  console.log(setup);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Customer installs to C:\\Program Files\\PunchType\\');
  // eslint-disable-next-line no-console
  console.log('Then they can delete the downloaded Setup.exe.');
}

main();
