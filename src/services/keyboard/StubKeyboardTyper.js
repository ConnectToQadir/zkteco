'use strict';

const { sleep } = require('../../utils/sleep');
const { AppError } = require('../../utils/errors');

const ALLOWED_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Non-Windows / fallback typer: does not inject keys; records what would be typed.
 * Keeps development on macOS safe.
 */
class StubKeyboardTyper {
  constructor() {
    this.platform = process.platform;
    /** @type {string[]} */
    this.history = [];
  }

  /**
   * @param {string} text
   * @param {{ delayMs: number, pressEnter: boolean }} options
   * @returns {Promise<void>}
   */
  async typeText(text, options) {
    const value = String(text || '');
    if (!ALLOWED_ID.test(value)) {
      throw new AppError('Employee ID contains unsupported characters.', 400, 'INVALID_EMPLOYEE_ID');
    }

    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    for (let i = 0; i < value.length; i += 1) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
    if (options.pressEnter && delayMs > 0) {
      await sleep(delayMs);
    }

    this.history.unshift({
      text: value,
      pressEnter: Boolean(options.pressEnter),
      at: new Date().toISOString(),
      mode: 'stub',
    });
    if (this.history.length > 50) {
      this.history.length = 50;
    }
  }
}

module.exports = {
  StubKeyboardTyper,
  ALLOWED_ID,
};
