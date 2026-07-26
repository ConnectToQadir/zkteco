'use strict';

const { sleep } = require('../../../utils/sleep');
const { normalizePunch } = require('../../../types/attendance');

/**
 * Shared helpers for ZK adapters.
 */
class BaseZkAdapter {
  /**
   * @param {import('../../../types/attendance').DeviceEndpoint} endpoint
   * @param {string} name
   */
  constructor(endpoint, name) {
    this.endpoint = {
      ip: endpoint.ip,
      port: endpoint.port || 4370,
      password: endpoint.password || '',
      timeoutMs: endpoint.timeoutMs || 5000,
      udpInPort: endpoint.udpInPort || 5200,
    };
    this.name = name;
    this._client = null;
    this._listening = false;
    this._pollTimer = null;
    this._seenKeys = new Set();
    this._seeded = false;
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return Boolean(this._client);
  }

  /**
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   * @returns {Promise<void>} resolves when listening ends (disconnect/error)
   */
  async listenRealtime(onPunch) {
    throw new Error('listenRealtime not implemented');
  }

  /**
   * @returns {Promise<object>}
   */
  async getInfo() {
    throw new Error('getInfo not implemented');
  }

  /**
   * @returns {Promise<unknown>}
   */
  async getAttendances() {
    throw new Error('getAttendances not implemented');
  }

  async connect() {
    throw new Error('connect not implemented');
  }

  async disconnect() {
    throw new Error('disconnect not implemented');
  }

  /**
   * Polling fallback while keeping an open session.
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   * @param {{ intervalMs?: number, signal?: { stopped: boolean } }} [options]
   * @returns {Promise<void>}
   */
  async listenByPolling(onPunch, options = {}) {
    const intervalMs = options.intervalMs || 2000;
    const signal = options.signal || { stopped: false };

    while (!signal.stopped && this._client) {
      try {
        const result = await this.getAttendances();
        const rows = this._extractAttendanceRows(result);
        await this._processAttendanceRows(rows, onPunch);
      } catch (error) {
        throw error;
      }
      await sleep(intervalMs);
    }
  }

  /**
   * @param {unknown} result
   * @returns {unknown[]}
   */
  _extractAttendanceRows(result) {
    if (!result) {
      return [];
    }
    if (Array.isArray(result)) {
      return result;
    }
    if (typeof result === 'object' && Array.isArray(/** @type {any} */ (result).data)) {
      return /** @type {any} */ (result).data;
    }
    return [];
  }

  /**
   * @param {unknown[]} rows
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   */
  async _processAttendanceRows(rows, onPunch) {
    const keys = [];
    let ignored = 0;
    for (const row of rows) {
      const punch = normalizePunch(row, this.endpoint.ip, `${this.name}-poll`);
      if (!punch) {
        ignored += 1;
        if (typeof this.onUnparsedPunch === 'function') {
          try {
            this.onUnparsedPunch(row);
          } catch (_error) {
            // ignore
          }
        }
        continue;
      }
      const key = `${punch.employeeId}|${punch.punchedAt.toISOString()}`;
      keys.push(key);
      if (!this._seeded) {
        this._seenKeys.add(key);
        continue;
      }
      if (!this._seenKeys.has(key)) {
        this._seenKeys.add(key);
        onPunch(punch);
      }
    }

    if (!this._seeded) {
      this._seeded = true;
      this._seedMeta = { total: rows.length, ignored, tracked: this._seenKeys.size };
      if (typeof this.onPollSeeded === 'function') {
        try {
          this.onPollSeeded(this._seedMeta);
        } catch (_error) {
          // ignore
        }
      }
    }

    // Bound memory: keep last ~5000 keys
    if (this._seenKeys.size > 5000) {
      const keep = keys.slice(-2000);
      this._seenKeys = new Set(keep);
    }
  }

  /**
   * @param {unknown} raw
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   */
  _emitNormalized(raw, onPunch) {
    const punch = normalizePunch(raw, this.endpoint.ip, this.name);
    if (punch) {
      onPunch(punch);
      return;
    }
    if (typeof this.onUnparsedPunch === 'function') {
      try {
        this.onUnparsedPunch(raw);
      } catch (_error) {
        // ignore logging failures
      }
    }
  }
}

module.exports = {
  BaseZkAdapter,
};
