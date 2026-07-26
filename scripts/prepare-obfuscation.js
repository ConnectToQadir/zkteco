'use strict';

/**
 * Prepare production JS for obfuscation.
 * Copies runtime sources into obfuscated/staging then runs javascript-obfuscator
 * on selected service modules (keeps Express entry readable enough to boot).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, 'obfuscated', 'staging');
const OUT = path.join(ROOT, 'obfuscated', 'out');

const SENSITIVE_GLOBS = [
  'src/services/config/ConfigCrypto.js',
  'src/services/license/RsaVerifier.js',
  'src/services/license/LicenseService.js',
  'src/services/license/HardwareFingerprint.js',
  'src/services/keyboard/Win32SendInputTyper.js',
  'src/utils/windowsBackground.js',
];

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'obfuscated' || entry.name === 'dist') {
        continue;
      }
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function main() {
  rimraf(STAGE);
  rimraf(OUT);
  fs.mkdirSync(STAGE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyDir(path.join(ROOT, 'src'), path.join(STAGE, 'src'));
  copyDir(path.join(ROOT, 'public'), path.join(STAGE, 'public'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STAGE, 'package.json'));

  const obfuscatorBin = path.join(ROOT, 'node_modules', '.bin', 'javascript-obfuscator');
  for (const rel of SENSITIVE_GLOBS) {
    const target = path.join(STAGE, rel);
    if (!fs.existsSync(target)) {
      // eslint-disable-next-line no-console
      console.warn('skip missing', rel);
      continue;
    }
    execFileSync(
      obfuscatorBin,
      [
        target,
        '--output',
        target,
        '--compact',
        'true',
        '--control-flow-flattening',
        'true',
        '--dead-code-injection',
        'false',
        '--string-array',
        'true',
        '--string-array-threshold',
        '0.75',
      ],
      { stdio: 'inherit' },
    );
  }

  copyDir(STAGE, OUT);
  // eslint-disable-next-line no-console
  console.log('Obfuscation staging ready at obfuscated/out');
  // eslint-disable-next-line no-console
  console.log('Sensitive modules obfuscated:', SENSITIVE_GLOBS.length);
}

main();
