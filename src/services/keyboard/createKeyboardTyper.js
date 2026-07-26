'use strict';

const { StubKeyboardTyper } = require('./StubKeyboardTyper');

/**
 * @returns {import('./StubKeyboardTyper').StubKeyboardTyper | import('./Win32SendInputTyper').Win32SendInputTyper}
 */
function createKeyboardTyper() {
  if (process.platform === 'win32') {
    try {
      // Lazy require so packaging issues with koffi do not crash the whole app.
      const { Win32SendInputTyper } = require('./Win32SendInputTyper');
      return new Win32SendInputTyper();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[PunchType] Win32 keyboard typer failed to load; using stub until fixed:',
        error.message,
      );
      return new StubKeyboardTyper();
    }
  }
  return new StubKeyboardTyper();
}

module.exports = {
  createKeyboardTyper,
};
