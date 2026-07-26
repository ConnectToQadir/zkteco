'use strict';

const koffi = require('koffi');
const { sleep } = require('../../utils/sleep');
const { AppError } = require('../../utils/errors');
const { ALLOWED_ID } = require('./StubKeyboardTyper');

const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const VK_RETURN = 0x0d;

/**
 * Types into the currently focused window using Win32 SendInput.
 * Does not activate or steal focus.
 */
class Win32SendInputTyper {
  constructor() {
    this.platform = 'win32';
    this.mode = 'sendinput';
    this._ready = false;
    this._SendInput = null;
    this._INPUT = null;
  }

  _ensureLoaded() {
    if (this._ready) {
      return;
    }
    if (process.platform !== 'win32') {
      throw new AppError('Win32 keyboard typer is only available on Windows.', 500, 'KEYBOARD_WRONG_OS');
    }

    const user32 = koffi.load('user32.dll');

    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
      dx: 'long',
      dy: 'long',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr',
    });

    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr',
    });

    const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
      uMsg: 'uint32',
      wParamL: 'uint16',
      wParamH: 'uint16',
    });

    // Full INPUT layout so sizeof matches what SendInput expects on x64.
    this._INPUT = koffi.struct('INPUT', {
      type: 'uint32',
      u: koffi.union('INPUTUNION', {
        mi: MOUSEINPUT,
        ki: KEYBDINPUT,
        hi: HARDWAREINPUT,
      }),
    });

    this._SendInput = user32.func('uint __stdcall SendInput(uint nInputs, INPUT *pInputs, int cbSize)');
    this._ready = true;
  }

  /**
   * @param {string} text
   * @param {{ delayMs: number, pressEnter: boolean }} options
   * @returns {Promise<void>}
   */
  async typeText(text, options) {
    this._ensureLoaded();

    const value = String(text || '');
    if (!value || !ALLOWED_ID.test(value)) {
      throw new AppError('Employee ID contains unsupported characters.', 400, 'INVALID_EMPLOYEE_ID');
    }

    const delayMs = Math.max(0, Number(options.delayMs) || 0);

    for (const char of value) {
      await this._sendUnicodeChar(char);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }

    if (options.pressEnter) {
      await this._sendVirtualKey(VK_RETURN);
    }
  }

  /**
   * @param {string} char
   */
  async _sendUnicodeChar(char) {
    const code = char.codePointAt(0);
    if (code == null) {
      return;
    }

    const down = {
      type: INPUT_KEYBOARD,
      u: {
        ki: {
          wVk: 0,
          wScan: code,
          dwFlags: KEYEVENTF_UNICODE,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    const up = {
      type: INPUT_KEYBOARD,
      u: {
        ki: {
          wVk: 0,
          wScan: code,
          dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };

    this._sendInputs([down, up]);
  }

  /**
   * @param {number} vk
   */
  async _sendVirtualKey(vk) {
    const down = {
      type: INPUT_KEYBOARD,
      u: {
        ki: {
          wVk: vk,
          wScan: 0,
          dwFlags: 0,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    const up = {
      type: INPUT_KEYBOARD,
      u: {
        ki: {
          wVk: vk,
          wScan: 0,
          dwFlags: KEYEVENTF_KEYUP,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    this._sendInputs([down, up]);
  }

  /**
   * @param {object[]} inputs
   */
  _sendInputs(inputs) {
    const size = koffi.sizeof(this._INPUT);
    const sent = this._SendInput(inputs.length, inputs, size);
    if (sent !== inputs.length) {
      throw new AppError('SendInput failed to inject keystrokes.', 500, 'SENDINPUT_FAILED');
    }
  }
}

module.exports = {
  Win32SendInputTyper,
};
