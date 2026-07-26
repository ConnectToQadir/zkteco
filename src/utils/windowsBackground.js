'use strict';

/**
 * Hide the console window when running as a background Windows utility.
 * Safe no-op on macOS/Linux and when not requested.
 *
 * @param {{ enabled?: boolean }} [options]
 * @returns {{ active: boolean, reason: string }}
 */
function applyBackgroundMode(options = {}) {
  const requested =
    options.enabled === true ||
    process.argv.includes('--background') ||
    process.env.PUNCHTYPE_BACKGROUND === '1';

  if (!requested) {
    return { active: false, reason: 'not_requested' };
  }

  if (process.platform !== 'win32') {
    return { active: false, reason: 'not_windows' };
  }

  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const FreeConsole = kernel32.func('bool __stdcall FreeConsole()');
    const ok = FreeConsole();
    return {
      active: Boolean(ok),
      reason: ok ? 'console_detached' : 'freeconsole_failed',
    };
  } catch (error) {
    return {
      active: false,
      reason: `freeconsole_error:${error.message}`,
    };
  }
}

/**
 * @returns {boolean}
 */
function isBackgroundRequested() {
  return process.argv.includes('--background') || process.env.PUNCHTYPE_BACKGROUND === '1';
}

module.exports = {
  applyBackgroundMode,
  isBackgroundRequested,
};
