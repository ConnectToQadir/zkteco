'use strict';

const Zkteco = require('zkteco-js');
const { BaseZkAdapter } = require('./BaseZkAdapter');
const { AppError } = require('../../../utils/errors');
const { withTimeout } = require('../../../utils/withTimeout');

/**
 * Primary adapter using zkteco-js.
 */
class ZktecoJsAdapter extends BaseZkAdapter {
  /**
   * @param {import('../../../types/attendance').DeviceEndpoint} endpoint
   */
  constructor(endpoint) {
    super(endpoint, 'zkteco-js');
  }

  async connect() {
    const client = new Zkteco(
      this.endpoint.ip,
      this.endpoint.port,
      this.endpoint.timeoutMs,
      this.endpoint.udpInPort,
    );

    await withTimeout(
      client.createSocket(),
      this.endpoint.timeoutMs + 2000,
      `Connection to ${this.endpoint.ip}:${this.endpoint.port} timed out (zkteco-js).`,
    );

    try {
      await withTimeout(client.enableDevice(), 3000, 'enableDevice timed out.');
    } catch (_error) {
      // Some firmwares reject enable; connection may still work.
    }

    this._client = client;
    this._seeded = false;
    this._seenKeys = new Set();
  }

  async disconnect() {
    const client = this._client;
    this._client = null;
    if (!client) {
      return;
    }
    try {
      await withTimeout(client.disconnect(), 3000, 'disconnect timed out.');
    } catch (_error) {
      // Ignore disconnect races.
    }
  }

  async getInfo() {
    this._assertConnected();
    return withTimeout(this._client.getInfo(), 5000, 'getInfo timed out.');
  }

  async getAttendances() {
    this._assertConnected();
    return withTimeout(this._client.getAttendances(), 15000, 'getAttendances timed out.');
  }

  /**
   * @param {(punch: import('../../../types/attendance').AttendancePunch) => void} onPunch
   * @returns {Promise<void>}
   */
  async listenRealtime(onPunch) {
    this._assertConnected();

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (err) => {
        if (settled) {
          return;
        }
        settled = true;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      try {
        Promise.resolve(
          this._client.getRealTimeLogs((raw) => {
            try {
              this._emitNormalized(raw, onPunch);
            } catch (_error) {
              // Never crash the process on a bad punch payload.
            }
          }),
        ).catch(finish);

        const timer = setInterval(() => {
          if (!this._client) {
            clearInterval(timer);
            finish();
          }
        }, 2000);

        this._stopRealtime = () => {
          clearInterval(timer);
          finish();
        };
      } catch (error) {
        finish(error);
      }
    });
  }

  stopRealtime() {
    if (typeof this._stopRealtime === 'function') {
      this._stopRealtime();
      this._stopRealtime = null;
    }
  }

  _assertConnected() {
    if (!this._client) {
      throw new AppError('Device is not connected.', 400, 'DEVICE_NOT_CONNECTED');
    }
  }
}

module.exports = {
  ZktecoJsAdapter,
};
