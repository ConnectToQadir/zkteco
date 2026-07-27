'use strict';

/**
 * Production build helper (Windows recommended):
 * 1) stage sources (plain by default — reliable with pkg)
 * 2) pkg → dist/PunchType.exe
 * 3) copy runtime folders required by the installer
 *
 * Set PUNCHTYPE_OBFUSCATE=1 to enable obfuscation (may break pkg requires).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'obfuscated', 'out');

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

function stagePlainSources() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyRecursive(path.join(ROOT, 'src'), path.join(OUT, 'src'));
  copyRecursive(path.join(ROOT, 'public'), path.join(OUT, 'public'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(OUT, 'package.json'));
}

function main() {
  if (process.platform !== 'win32') {
    // eslint-disable-next-line no-console
    console.warn(
      '[PunchType] Warning: building on non-Windows. Prefer a Windows PC for PunchType.exe + installer (koffi native module).',
    );
  }

  const obfuscate = process.env.PUNCHTYPE_OBFUSCATE === '1';
  if (obfuscate) {
    // eslint-disable-next-line no-console
    console.log('1/3 Preparing obfuscated sources (PUNCHTYPE_OBFUSCATE=1)...');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'prepare-obfuscation.js')], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } else {
    // eslint-disable-next-line no-console
    console.log('1/3 Staging plain sources for reliable pkg build...');
    stagePlainSources();
  }

  fs.mkdirSync(DIST, { recursive: true });

  const pkgBinName = process.platform === 'win32' ? 'pkg.cmd' : 'pkg';
  const pkgBin = path.join(ROOT, 'node_modules', '.bin', pkgBinName);
  const pkgCliJs = path.join(ROOT, 'node_modules', 'pkg', 'lib-es5', 'bin.js');

  // eslint-disable-next-line no-console
  console.log('2/3 Building PunchType.exe (node18-win-x64)...');

  const pkgArgs = [
    path.join(OUT, 'src', 'index.js'),
    '--targets',
    'node18-win-x64',
    '--output',
    path.join(DIST, 'PunchType.exe'),
    '--config',
    path.join(ROOT, 'package.json'),
  ];

  let result;
  if (fs.existsSync(pkgBin)) {
    result = spawnSync(pkgBin, pkgArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } else if (fs.existsSync(pkgCliJs)) {
    result = spawnSync(process.execPath, [pkgCliJs, ...pkgArgs], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });
  } else {
    // eslint-disable-next-line no-console
    console.error('pkg is not installed. Run: npm install');
    process.exitCode = 1;
    return;
  }

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
  fs.copyFileSync(
    path.join(ROOT, 'installer', 'PunchType-RunHidden.vbs'),
    path.join(DIST, 'PunchType-RunHidden.vbs'),
  );
  writePlaceholder(path.join(DIST, 'license'), 'Runtime license uploads are stored here.');
  writePlaceholder(path.join(DIST, 'logs'), 'Runtime log files are stored here.');

  const exePath = path.join(DIST, 'PunchType.exe');
  if (process.platform === 'win32' && fs.existsSync(exePath)) {
    try {
      const where = spawnSync('where', ['editbin'], { shell: true, encoding: 'utf8' });
      const editbin =
        where.status === 0 && where.stdout
          ? where.stdout.trim().split(/\r?\n/)[0].trim()
          : '';
      if (editbin) {
        execFileSync(editbin, ['/SUBSYSTEM:WINDOWS', exePath]);
        // eslint-disable-next-line no-console
        console.log('Set PunchType.exe subsystem to Windows (no console window).');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '[PunchType] Could not set Windows subsystem on exe:',
        error.message || error,
      );
      // eslint-disable-next-line no-console
      console.warn('[PunchType] PunchType-RunHidden.vbs still launches without a CMD window.');
    }
  }

  // Help pkg/native module resolution: ship koffi binaries beside the exe when present.
  const koffiDir = path.join(ROOT, 'node_modules', 'koffi');
  if (fs.existsSync(koffiDir)) {
    try {
      copyRecursive(koffiDir, path.join(DIST, 'node_modules', 'koffi'));
    } catch (_error) {
      // optional
    }
  }

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
      'Debug tip:',
      '  Run PunchType.exe WITHOUT --background to see console errors.',
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
