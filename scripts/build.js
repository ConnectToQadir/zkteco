'use strict';

/**
 * Production build helper (Windows recommended):
 * 1) prepare obfuscated tree
 * 2) pkg → dist/PunchType.exe
 * 3) copy runtime folders required by the installer
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function writePlaceholder(dir, note) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.keep'), `${note}\n`, 'utf8');
}

function main() {
  if (process.platform !== 'win32') {
    // eslint-disable-next-line no-console
    console.warn(
      '[PunchType] Warning: building on non-Windows. Prefer a Windows PC for PunchType.exe + installer (koffi native module).',
    );
  }

  // eslint-disable-next-line no-console
  console.log('1/3 Preparing obfuscated sources...');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'prepare-obfuscation.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const outDir = path.join(ROOT, 'obfuscated', 'out');
  fs.mkdirSync(DIST, { recursive: true });

  const pkgBin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'pkg.cmd' : 'pkg',
  );

  // eslint-disable-next-line no-console
  console.log('2/3 Building PunchType.exe (node18-win-x64)...');
  const result = spawnSync(
    pkgBin,
    [
      path.join(outDir, 'src', 'index.js'),
      '--targets',
      'node18-win-x64',
      '--output',
      path.join(DIST, 'PunchType.exe'),
      '--config',
      path.join(ROOT, 'package.json'),
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    // eslint-disable-next-line no-console
    console.error('pkg build failed.');
    // eslint-disable-next-line no-console
    console.error('Run this on Windows after: npm install');
    process.exitCode = result.status || 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log('3/3 Copying installer assets into dist/...');
  copyRecursive(path.join(ROOT, 'public'), path.join(DIST, 'public'));
  fs.mkdirSync(path.join(DIST, 'keys'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'src', 'keys', 'public.pem'),
    path.join(DIST, 'keys', 'public.pem'),
  );
  writePlaceholder(path.join(DIST, 'license'), 'Runtime license uploads are stored here.');
  writePlaceholder(path.join(DIST, 'logs'), 'Runtime log files are stored here.');

  fs.writeFileSync(
    path.join(DIST, 'BUILD_OK.txt'),
    [
      'PunchType dist build is ready for Inno Setup.',
      '',
      'Next:',
      '  npm run build:installer',
      '',
      'Website upload file will be:',
      '  release\\PunchType-Setup-1.0.0.exe',
      '',
    ].join('\n'),
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('dist/ is ready.');
  // eslint-disable-next-line no-console
  console.log('Next: npm run build:installer');
}

main();
