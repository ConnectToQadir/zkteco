'use strict';

/**
 * @typedef {Object} AppConfig
 * @property {string} deviceIp
 * @property {number} devicePort
 * @property {string} devicePassword
 * @property {number} httpPort
 * @property {number} typingDelay
 * @property {number} duplicateSeconds
 * @property {boolean} pressEnter
 * @property {boolean} autoStart
 * @property {boolean} logging
 * @property {string} settingsPinHash
 * @property {string} settingsPinSalt
 */

/** @returns {AppConfig} */
function createDefaultConfig() {
  return {
    deviceIp: '',
    devicePort: 4370,
    devicePassword: '',
    httpPort: 47825,
    typingDelay: 100,
    duplicateSeconds: 5,
    pressEnter: true,
    autoStart: true,
    logging: true,
    settingsPinHash: '',
    settingsPinSalt: '',
  };
}

/**
 * Public-safe config (no secrets).
 * @param {AppConfig} config
 */
function toPublicConfig(config) {
  return {
    deviceIp: config.deviceIp,
    devicePort: config.devicePort,
    devicePasswordSet: Boolean(config.devicePassword),
    httpPort: config.httpPort,
    typingDelay: config.typingDelay,
    duplicateSeconds: config.duplicateSeconds,
    pressEnter: config.pressEnter,
    autoStart: config.autoStart,
    logging: config.logging,
    pinConfigured: Boolean(config.settingsPinHash && config.settingsPinSalt),
  };
}

module.exports = {
  createDefaultConfig,
  toPublicConfig,
};
