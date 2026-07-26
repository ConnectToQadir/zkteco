'use strict';

const { StubKeyboardTyper } = require('./StubKeyboardTyper');

/**
 * @returns {import('./StubKeyboardTyper').StubKeyboardTyper | import('./Win32SendInputTyper').Win32SendInputTyper}
 */
function createKeyboardTyper() {
  if (process.platform === 'win32') {
    // Lazy require so macOS/Linux installs do not load user32 bindings at import time.
    const { Win32SendInputTyper } = require('./Win32SendInputTyper');
    return new Win32SendInputTyper();
  }
  return new StubKeyboardTyper();
}

module.exports = {
  createKeyboardTyper,
};
