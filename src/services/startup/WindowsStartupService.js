'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { getAppRoot } = require('../../utils/paths');
const { AppError } = require('../../utils/errors');

const execFileAsync = promisify(execFile);
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'PunchType';

/**
 * Manages "Start with Windows" via HKCU Run key.
 * No-ops on non-Windows platforms.
 */
class WindowsStartupService {
  /**
   * @param {{
   *   logger?: { info: Function, error: Function },
   *   valueName?: string,
   * }} [options]
   */
  constructor(options = {}) {
    this._logger = options.logger || {
      info: async () => {},
      error: async () => {},
    };
    this._valueName = options.valueName || VALUE_NAME;
  }

  /**
   * @returns {boolean}
   */
  isSupported() {
    return process.platform === 'win32';
  }

  /**
   * Command used for autostart (always includes --background).
   * @returns {string}
   */
  getLaunchCommand() {
    if (process.pkg || path.basename(process.execPath).toLowerCase().includes('punchtype')) {
      return `"${process.execPath}" --background`;
    }

    const entry = path.join(getAppRoot(), 'src', 'index.js');
    return `"${process.execPath}" "${entry}" --background`;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async isEnabled() {
    if (!this.isSupported()) {
      return false;
    }
    try {
      const { stdout } = await execFileAsync('reg', [
        'query',
        RUN_KEY,
        '/v',
        this._valueName,
      ]);
      return stdout.toLowerCase().includes(this._valueName.toLowerCase());
    } catch (_error) {
      return false;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async enable() {
    if (!this.isSupported()) {
      await this._logger.info('Windows startup skipped (not Windows)');
      return;
    }

    const command = this.getLaunchCommand();
    try {
      await execFileAsync('reg', [
        'add',
        RUN_KEY,
        '/v',
        this._valueName,
        '/t',
        'REG_SZ',
        '/d',
        command,
        '/f',
      ]);
      await this._logger.info('Windows startup enabled', { command });
    } catch (error) {
      throw new AppError(
        `Failed to enable Windows startup: ${error.message}`,
        500,
        'STARTUP_ENABLE_FAILED',
      );
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async disable() {
    if (!this.isSupported()) {
      return;
    }

    try {
      await execFileAsync('reg', ['delete', RUN_KEY, '/v', this._valueName, '/f']);
      await this._logger.info('Windows startup disabled');
    } catch (error) {
      // ERROR: The system was unable to find the specified registry key or value.
      const msg = String(error.message || error.stderr || '');
      if (/unable to find|cannot find/i.test(msg)) {
        return;
      }
      throw new AppError(
        `Failed to disable Windows startup: ${error.message}`,
        500,
        'STARTUP_DISABLE_FAILED',
      );
    }
  }

  /**
   * Apply config.autoStart to the registry.
   * @param {boolean} autoStart
   * @returns {Promise<{ applied: boolean, enabled: boolean }>}
   */
  async syncFromConfig(autoStart) {
    if (!this.isSupported()) {
      return { applied: false, enabled: false };
    }
    if (autoStart) {
      await this.enable();
      return { applied: true, enabled: true };
    }
    await this.disable();
    return { applied: true, enabled: false };
  }

  /**
   * @returns {Promise<object>}
   */
  async getStatus() {
    const supported = this.isSupported();
    const enabled = supported ? await this.isEnabled() : false;
    return {
      supported,
      enabled,
      valueName: this._valueName,
      launchCommand: supported ? this.getLaunchCommand() : null,
    };
  }
}

module.exports = {
  WindowsStartupService,
};
