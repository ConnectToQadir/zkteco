'use strict';

const { BaseZkAdapter } = require('./BaseZkAdapter');
const { sleep } = require('../../../utils/sleep');

/**
 * Fake ZK device for macOS / local development (no hardware required).
 * Stays "connected" in polling mode. Real punches are injected via
 * ZktecoService.injectPunch() or the Settings "Simulate Punch" button.
 */
class MockZkAdapter extends BaseZkAdapter {
  /**
   * @param {import('../../../types/attendance').DeviceEndpoint} endpoint
   */
  constructor(endpoint) {
    super(endpoint, 'mock');
    /** @type {unknown[]} */
    this._queue = [];
  }

  async connect() {
    this._client = { mock: true };
    this._seeded = true;
    this._seenKeys = new Set();
  }

  async disconnect() {
    this._client = null;
    this._queue = [];
  }

  async getInfo() {
    this._assertConnected();
    return {
      mock: true,
      message: 'Mock ZK device (local development)',
      userCount: 0,
      logCount: this._queue.length,
    };
  }

  async getAttendances() {
    this._assertConnected();
    const rows = this._queue.splice(0, this._queue.length);
    return { data: rows };
  }

  /**
   * Queue a fake attendance row for the next poll cycle.
   * @param {{ userId: string|number, attTime?: string }} row
   */
  enqueuePunch(row) {
    this._queue.push({
      userId: row.userId,
      attTime: row.attTime || new Date().toISOString(),
    });
  }

  async listenRealtime(onPunch) {
    this._assertConnected();
    // Keep the promise pending until disconnect/stop — same shape as real adapters.
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (!this._client) {
          clearInterval(timer);
          resolve();
        }
      }, 2000);
      this._stopRealtime = () => {
        clearInterval(timer);
        resolve();
      };
      // unused in mock path; silence lint
      void onPunch;
    });
  }

  stopRealtime() {
    if (typeof this._stopRealtime === 'function') {
      this._stopRealtime();
      this._stopRealtime = null;
    }
  }

  /**
   * Idle poll loop that drains the inject queue.
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   * @param {{ intervalMs?: number, signal?: { stopped: boolean } }} [options]
   */
  async listenByPolling(onPunch, options = {}) {
    const intervalMs = options.intervalMs || 500;
    const signal = options.signal || { stopped: false };

    if (typeof this.onPollSeeded === 'function') {
      try {
        this.onPollSeeded({ total: 0, tracked: 0, ignored: 0 });
      } catch (_error) {
        // ignore
      }
    }

    while (!signal.stopped && this._client) {
      const result = await this.getAttendances();
      const rows = this._extractAttendanceRows(result);
      for (const row of rows) {
        this._emitNormalized(row, onPunch);
      }
      await sleep(intervalMs);
    }
  }

  _assertConnected() {
    if (!this._client) {
      throw new Error('Mock device is not connected.');
    }
  }
}

/**
 * @param {string | undefined} ip
 * @returns {boolean}
 */
function isMockDeviceIp(ip) {
  const value = String(ip || '')
    .trim()
    .toLowerCase();
  return value === 'mock' || value === 'mock.local';
}

/**
 * @returns {boolean}
 */
function isMockDeviceEnabled() {
  return process.env.PUNCHTYPE_MOCK_DEVICE === '1' || process.env.PUNCHTYPE_MOCK_DEVICE === 'true';
}

module.exports = {
  MockZkAdapter,
  isMockDeviceIp,
  isMockDeviceEnabled,
};
