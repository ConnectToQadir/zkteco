'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getLogsDir } = require('../../utils/paths');

/**
 * Production logger: daily text files under logs/ + in-memory tail for the UI.
 * Respects config.logging (can be toggled at runtime).
 */
class LoggerService {
  /**
   * @param {{
   *   logsDir?: string,
   *   enabled?: boolean,
   *   maxMemoryLines?: number,
   *   mirrorToConsole?: boolean,
   * }} [options]
   */
  constructor(options = {}) {
    this._logsDir = options.logsDir || getLogsDir();
    this._enabled = options.enabled !== false;
    this._maxMemoryLines = options.maxMemoryLines || 400;
    this._mirrorToConsole = options.mirrorToConsole !== false;
    /** @type {string[]} */
    this._lines = [];
    this._writeQueue = Promise.resolve();
    this._dirReady = false;
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
  }

  /**
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * @param {boolean} mirror
   */
  setMirrorToConsole(mirror) {
    this._mirrorToConsole = Boolean(mirror);
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  async info(event, meta) {
    await this._write('INFO', event, meta);
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  async error(event, meta) {
    await this._write('ERROR', event, meta);
  }

  /**
   * @returns {string[]}
   */
  getLines() {
    return this._lines.slice();
  }

  /**
   * Read today's log file from disk (best effort).
   * @param {number} [maxLines=200]
   * @returns {Promise<string[]>}
   */
  async readTodayLines(maxLines = 200) {
    try {
      const filePath = this._todayFilePath();
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      return lines.slice(-maxLines).reverse();
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return this.getLines();
      }
      return this.getLines();
    }
  }

  /**
   * @param {string} level
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  async _write(level, event, meta) {
    const isError = level === 'ERROR';
    if (!this._enabled && !isError) {
      return;
    }

    const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const line = `${new Date().toISOString()} [${level}] ${event}${suffix}`;

    this._lines.unshift(line);
    if (this._lines.length > this._maxMemoryLines) {
      this._lines.length = this._maxMemoryLines;
    }

    if (this._mirrorToConsole && (this._enabled || isError)) {
      if (isError) {
        // eslint-disable-next-line no-console
        console.error(line);
      } else {
        // eslint-disable-next-line no-console
        console.log(line);
      }
    }

    if (this._enabled) {
      this._writeQueue = this._writeQueue.then(() => this._appendToFile(line)).catch(() => {});
      await this._writeQueue;
    }
  }

  /**
   * @param {string} line
   */
  async _appendToFile(line) {
    await this._ensureDir();
    await fs.appendFile(this._todayFilePath(), `${line}\n`, 'utf8');
  }

  async _ensureDir() {
    if (this._dirReady) {
      return;
    }
    await fs.mkdir(this._logsDir, { recursive: true });
    this._dirReady = true;
  }

  /**
   * Read startup-error.log if the app failed before the logger was ready.
   * @param {number} [maxLines=50]
   * @returns {Promise<string[]>}
   */
  async readStartupErrorLines(maxLines = 50) {
    try {
      const filePath = path.join(this._logsDir, 'startup-error.log');
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      return lines.slice(-maxLines);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      return [];
    }
  }

  /**
   * @returns {string}
   */
  getLogsDirPath() {
    return this._logsDir;
  }

  /**
   * @returns {string}
   */
  _todayFilePath() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return path.join(this._logsDir, `${yyyy}-${mm}-${dd}.log`);
  }
}
module.exports = {
  LoggerService,
};
