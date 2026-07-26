'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Install folder (exe + public + keys).
 * @returns {boolean}
 */
function isPackaged() {
  const execPath = process.execPath || '';
  return Boolean(process.pkg) || /punchtype(\.exe)?$/i.test(path.basename(execPath));
}

/**
 * Folder where PunchType.exe lives (or project root in dev).
 * @returns {string}
 */
function getInstallRoot() {
  if (isPackaged()) {
    return path.dirname(process.execPath);
  }
  // src/utils -> src -> project root
  return path.resolve(__dirname, '..', '..');
}

/**
 * Writable data folder.
 * Packaged Windows installs must NOT rely on Program Files for writes (UAC).
 * Uses %LOCALAPPDATA%\PunchType
 * @returns {string}
 */
function getDataRoot() {
  if (process.env.PUNCHTYPE_DATA_DIR) {
    return path.resolve(process.env.PUNCHTYPE_DATA_DIR);
  }
  if (isPackaged() && process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'PunchType');
  }
  if (isPackaged()) {
    return path.join(os.homedir(), '.punchtype');
  }
  return getInstallRoot();
}

/**
 * Ensure writable runtime folders exist.
 * @returns {void}
 */
function ensureDataDirs() {
  const root = getDataRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'license'), { recursive: true });
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
}

/**
 * @param {...string} segments
 * @returns {string}
 */
function resolveFromRoot(...segments) {
  return path.join(getInstallRoot(), ...segments);
}

/**
 * @param {...string} segments
 * @returns {string}
 */
function resolveFromData(...segments) {
  return path.join(getDataRoot(), ...segments);
}

function getConfigEncPath() {
  return resolveFromData('config.enc');
}

/** Old location next to exe (Program Files) — used for one-time migration */
function getLegacyInstallConfigEncPath() {
  return path.join(getInstallRoot(), 'config.enc');
}

/** @deprecated Phase 2 plaintext file; migrated automatically to config.enc */
function getLegacyConfigJsonPath() {
  return resolveFromData('config.json');
}

/** @deprecated Use getConfigEncPath */
function getConfigPath() {
  return getConfigEncPath();
}

function getPublicDir() {
  return resolveFromRoot('public');
}

function getKeysDir() {
  return resolveFromRoot('keys');
}

function getLogsDir() {
  return resolveFromData('logs');
}

function getLicensePath() {
  return resolveFromData('license', 'license.dat');
}

/** Previous license location next to exe */
function getLegacyInstallLicensePath() {
  return path.join(getInstallRoot(), 'license', 'license.dat');
}

function getAppRoot() {
  return getInstallRoot();
}

module.exports = {
  isPackaged,
  getAppRoot,
  getInstallRoot,
  getDataRoot,
  ensureDataDirs,
  resolveFromRoot,
  resolveFromData,
  getConfigPath,
  getConfigEncPath,
  getLegacyInstallConfigEncPath,
  getLegacyConfigJsonPath,
  getPublicDir,
  getKeysDir,
  getLogsDir,
  getLicensePath,
  getLegacyInstallLicensePath,
};
