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
    const user32 = koffi.load('user32.dll');

    const GetConsoleWindow = kernel32.func('uintptr __stdcall GetConsoleWindow()');
    const FreeConsole = kernel32.func('bool __stdcall FreeConsole()');
    const ShowWindow = user32.func('bool __stdcall ShowWindow(uintptr hWnd, int nCmdShow)');

    const hwnd = GetConsoleWindow();
    if (hwnd) {
      ShowWindow(hwnd, 0);
    }

    const ok = FreeConsole();
    return {
      active: Boolean(ok),
      reason: ok ? 'console_detached' : hwnd ? 'console_hidden_only' : 'no_console_window',
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
