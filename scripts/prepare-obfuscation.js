'use strict';

/**
 * Prepare production JS for obfuscation.
 * Copies runtime sources into obfuscated/staging then obfuscates selected modules
 * using the javascript-obfuscator Node API (works on Windows + macOS).
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

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

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayThreshold: 0.5,
  // Critical for pkg: do not rewrite require('...') paths
  ignoreRequireImports: true,
  // Keep require()/exports working for CommonJS
  target: 'node',
  identifierNamesGenerator: 'hexadecimal',
  simplify: true,
};

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

function obfuscateFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS);
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
}

function main() {
  rimraf(STAGE);
  rimraf(OUT);
  fs.mkdirSync(STAGE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyDir(path.join(ROOT, 'src'), path.join(STAGE, 'src'));
  copyDir(path.join(ROOT, 'public'), path.join(STAGE, 'public'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STAGE, 'package.json'));

  let count = 0;
  for (const rel of SENSITIVE_GLOBS) {
    const target = path.join(STAGE, rel);
    if (!fs.existsSync(target)) {
      // eslint-disable-next-line no-console
      console.warn('skip missing', rel);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log('Obfuscating', rel);
    obfuscateFile(target);
    count += 1;
  }

  copyDir(STAGE, OUT);
  // eslint-disable-next-line no-console
  console.log('Obfuscation staging ready at obfuscated/out');
  // eslint-disable-next-line no-console
  console.log('Sensitive modules obfuscated:', count);
}

main();
