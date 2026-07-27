'use strict';

const ZKLib = require('node-zklib');
const { BaseZkAdapter } = require('./BaseZkAdapter');
const { AppError } = require('../../../utils/errors');
const { withTimeout } = require('../../../utils/withTimeout');
const { authenticateNodeZkLibClient, installNodeZkLibTransportCapture } = require('../zkDeviceAuth');

/**
 * Fallback adapter using node-zklib.
 */
class NodeZkLibAdapter extends BaseZkAdapter {
  /**
   * @param {import('../../../types/attendance').DeviceEndpoint} endpoint
   */
  constructor(endpoint) {
    super(endpoint, 'node-zklib');
  }

  async connect() {
    const client = new ZKLib(
      this.endpoint.ip,
      this.endpoint.port,
      this.endpoint.timeoutMs,
      this.endpoint.udpInPort,
    );

    installNodeZkLibTransportCapture(client);

    await withTimeout(
      client.createSocket(),
      this.endpoint.timeoutMs + 2000,
      `Connection to ${this.endpoint.ip}:${this.endpoint.port} timed out (node-zklib).`,
    ).catch(async (error) => {
      try {
        await client.disconnect();
      } catch (_disconnectError) {
        // ignore
      }
      throw error;
    });

    await withTimeout(
      authenticateNodeZkLibClient(client, this.endpoint.password),
      this.endpoint.timeoutMs + 2000,
      `Device authentication timed out for ${this.endpoint.ip}.`,
    );

    try {
      await withTimeout(client.enableDevice(), 3000, 'enableDevice timed out.');
    } catch (_error) {
      // Optional on some devices.
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
    const timeoutMs = Math.max(this.endpoint.timeoutMs * 3, 20000);
    return withTimeout(this._client.getAttendances(), timeoutMs, 'getAttendances timed out.');
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
        this._client.getRealTimeLogs((raw) => {
          try {
            this._emitNormalized(raw, onPunch);
          } catch (_error) {
            // Ignore malformed events.
          }
        });

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
  NodeZkLibAdapter,
};
