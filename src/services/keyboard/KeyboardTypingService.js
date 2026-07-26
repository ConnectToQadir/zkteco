'use strict';

/**
 * Serializes typing jobs so concurrent punches do not interleave keystrokes.
 */
class KeyboardTypingService {
  /**
   * @param {{
   *   typer: { typeText: (text: string, options: { delayMs: number, pressEnter: boolean }) => Promise<void> },
   *   logger?: { info: Function, error: Function },
   * }} deps
   */
  constructor(deps) {
    this._typer = deps.typer;
    this._logger = deps.logger || {
      info: async () => {},
      error: async () => {},
    };
    /** @type {Promise<void>} */
    this._queue = Promise.resolve();
    this._typedCount = 0;
    this._lastTyped = null;
  }

  /**
   * @returns {{ typedCount: number, lastTyped: object | null, platform: string }}
   */
  getStatus() {
    const mode =
      this._typer.mode ||
      (process.platform === 'win32' && this._typer.platform === 'win32' ? 'sendinput' : 'stub');
    return {
      typedCount: this._typedCount,
      lastTyped: this._lastTyped,
      platform: this._typer.platform || process.platform,
      mode,
    };
  }

  /**
   * @param {string} employeeId
   * @param {{ delayMs: number, pressEnter: boolean }} options
   * @returns {Promise<void>}
   */
  async typeEmployeeId(employeeId, options) {
    const run = async () => {
      await this._typer.typeText(employeeId, options);
      this._typedCount += 1;
      this._lastTyped = {
        employeeId,
        pressEnter: Boolean(options.pressEnter),
        at: new Date().toISOString(),
      };
      await this._logger.info('Employee typed', {
        employeeId,
        pressEnter: Boolean(options.pressEnter),
      });
    };

    this._queue = this._queue.then(run, run);
    return this._queue;
  }
}

module.exports = {
  KeyboardTypingService,
};
