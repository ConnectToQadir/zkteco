'use strict';

const ERROR_ALREADY_EXISTS = 183;

/**
 * Prevent multiple PunchType processes (e.g. autostart + manual launch).
 * @returns {boolean} true if this is the only instance
 */
function ensureSingleInstance() {
  if (process.platform !== 'win32') {
    return true;
  }

  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const CreateMutexW = kernel32.func(
      'uintptr __stdcall CreateMutexW(void *lpMutexAttributes, bool bInitialOwner, const char16 *lpName)',
    );
    const GetLastError = kernel32.func('uint32 __stdcall GetLastError()');

    CreateMutexW(null, true, 'Global\\PunchTypeSingleInstance_v1');
    const err = GetLastError();
    return err !== ERROR_ALREADY_EXISTS;
  } catch (_error) {
    return true;
  }
}

module.exports = {
  ensureSingleInstance,
};
