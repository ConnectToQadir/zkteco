'use strict';

const path = require('path');

/**
 * Resolve application root (works for both source and later packaged exe).
 * @returns {string}
 */
function getAppRoot() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  // src/utils -> src -> project root
  return path.resolve(__dirname, '..', '..');
}

/**
 * @param {...string} segments
 * @returns {string}
 */
function resolveFromRoot(...segments) {
  return path.join(getAppRoot(), ...segments);
}

function getConfigEncPath() {
  return resolveFromRoot('config.enc');
}

/** @deprecated Phase 2 plaintext file; migrated automatically to config.enc */
function getLegacyConfigJsonPath() {
  return resolveFromRoot('config.json');
}

/** @deprecated Use getConfigEncPath */
function getConfigPath() {
  return getConfigEncPath();
}

function getPublicDir() {
  return resolveFromRoot('public');
}

function getLogsDir() {
  return resolveFromRoot('logs');
}

function getLicensePath() {
  return resolveFromRoot('license', 'license.dat');
}

module.exports = {
  getAppRoot,
  resolveFromRoot,
  getConfigPath,
  getConfigEncPath,
  getLegacyConfigJsonPath,
  getPublicDir,
  getLogsDir,
  getLicensePath,
};
