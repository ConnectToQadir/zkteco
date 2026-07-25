'use strict';

/**
 * Lightweight in-memory + console logger used until Phase 6 file logging.
 */
class MemoryLogger {
  constructor() {
    /** @type {string[]} */
    this._lines = [];
    this._max = 300;
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  async info(event, meta) {
    this._write('INFO', event, meta);
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  async error(event, meta) {
    this._write('ERROR', event, meta);
  }

  /**
   * @returns {string[]}
   */
  getLines() {
    return this._lines.slice();
  }

  /**
   * @param {string} level
   * @param {string} event
   * @param {Record<string, unknown>} [meta]
   */
  _write(level, event, meta) {
    const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const line = `${new Date().toISOString()} [${level}] ${event}${suffix}`;
    this._lines.unshift(line);
    if (this._lines.length > this._max) {
      this._lines.length = this._max;
    }
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

module.exports = {
  MemoryLogger,
};
