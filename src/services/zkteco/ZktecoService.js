'use strict';

const { EventEmitter } = require('events');
const { sleep } = require('../../utils/sleep');
const { AppError, getErrorMessage } = require('../../utils/errors');
const { ZktecoJsAdapter } = require('./adapters/ZktecoJsAdapter');
const { NodeZkLibAdapter } = require('./adapters/NodeZkLibAdapter');
const {
  MockZkAdapter,
  isMockDeviceIp,
  isMockDeviceEnabled,
} = require('./adapters/MockZkAdapter');
const { normalizePunch } = require('../../types/attendance');

/**
 * Manages a single ZKTeco device connection with forever-retry reconnect.
 * Emits: punch, connected, disconnected, deviceError, state
 */
class ZktecoService extends EventEmitter {
  /**
   * @param {{
   *   configService: import('../config/ConfigService').ConfigService,
   *   logger?: { info: Function, error: Function },
   * }} deps
   */
  constructor(deps) {
    super();
    this._configService = deps.configService;
    this._logger = deps.logger || {
      info: async () => {},
      error: async () => {},
    };

    // Guard against accidental emit('error') crashing the process.
    this.on('error', (err) => {
      void this._logger.error('Unhandled device event error', {
        error: getErrorMessage(err),
      });
    });

    this._running = false;
    this._loopPromise = null;
    this._adapter = null;
    this._adapterName = null;
    this._mode = 'idle'; // idle | realtime | polling
    this._connected = false;
    this._lastError = null;
    this._lastConnectedAt = null;
    this._reconnectAttempt = 0;
    this._pollSignal = { stopped: true };
    /** @type {import('../../types/attendance').AttendancePunch[]} */
    this._recentPunches = [];
    this._healthTimer = null;
  }

  /**
   * @returns {object}
   */
  getStatus() {
    return {
      running: this._running,
      connected: this._connected,
      adapter: this._adapterName,
      mode: this._mode,
      reconnectAttempt: this._reconnectAttempt,
      lastError: this._lastError,
      lastConnectedAt: this._lastConnectedAt,
      recentPunches: this._recentPunches.slice(0, 10),
    };
  }

  /**
   * Start background connect/listen loop (non-blocking).
   * @returns {Promise<void>}
   */
  async start() {
    if (this._running) {
      return;
    }
    this._running = true;
    this._pollSignal.stopped = false;
    await this._logger.info('Device service starting');
    this._loopPromise = this._runLoop();
  }

  /**
   * Stop listening and disconnect.
   * @returns {Promise<void>}
   */
  async stop() {
    this._running = false;
    this._pollSignal.stopped = true;
    this._clearHealthTimer();
    await this._safeDisconnect();
    if (this._loopPromise) {
      try {
        await Promise.race([this._loopPromise, sleep(3000)]);
      } catch (_error) {
        // Loop may reject on stop; ignore.
      }
      this._loopPromise = null;
    }
    this._mode = 'idle';
    await this._logger.info('Device service stopped');
    this.emit('state', this.getStatus());
  }

  /**
   * Restart with latest config.
   * @returns {Promise<void>}
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * One-shot connection test using current or provided endpoint.
   * @param {Partial<import('../../types/attendance').DeviceEndpoint>} [override]
   * @returns {Promise<import('../../types/attendance').DeviceTestResult>}
   */
  async testConnection(override = {}) {
    const config = await this._configService.load();
    const endpoint = {
      ip: override.ip || config.deviceIp,
      port: override.port || config.devicePort,
      password: override.password !== undefined ? override.password : config.devicePassword,
      timeoutMs: 5000,
      udpInPort: 5200,
    };

    if (!endpoint.ip && !isMockDeviceEnabled()) {
      throw new AppError('Device IP is not configured.', 400, 'DEVICE_IP_REQUIRED');
    }

    if (isMockDeviceEnabled() || isMockDeviceIp(endpoint.ip)) {
      return {
        ok: true,
        message: 'Mock device is available (local development). Use Simulate Punch to inject attendance.',
        adapter: 'mock',
        info: { mock: true },
      };
    }

    const adapters = [
      () => new ZktecoJsAdapter(endpoint),
      () => new NodeZkLibAdapter(endpoint),
    ];

    /** @type {string[]} */
    const errors = [];

    for (const create of adapters) {
      const adapter = create();
      try {
        await adapter.connect();
        let info = null;
        try {
          info = await adapter.getInfo();
        } catch (_error) {
          info = { note: 'Connected, but getInfo is unsupported on this firmware.' };
        }
        await adapter.disconnect();
        return {
          ok: true,
          message: `Connected successfully via ${adapter.name}.`,
          adapter: adapter.name,
          info,
        };
      } catch (error) {
        errors.push(`${adapter.name}: ${getErrorMessage(error)}`);
        try {
          await adapter.disconnect();
        } catch (_disconnectError) {
          // ignore
        }
      }
    }

    return {
      ok: false,
      message: `Unable to connect to device. ${errors.join(' | ')}`,
    };
  }

  async _runLoop() {
    while (this._running) {
      const config = await this._configService.load();
      const useMock = isMockDeviceEnabled() || isMockDeviceIp(config.deviceIp);

      if (!config.deviceIp && !useMock) {
        this._connected = false;
        this._mode = 'idle';
        this._lastError = 'Device IP is not configured.';
        this.emit('state', this.getStatus());
        await sleep(3000);
        continue;
      }

      const endpoint = {
        ip: useMock ? config.deviceIp || 'mock' : config.deviceIp,
        port: config.devicePort,
        password: config.devicePassword,
        timeoutMs: 5000,
        udpInPort: 5200,
      };

      try {
        await this._connectAndListen(endpoint);
      } catch (error) {
        this._connected = false;
        this._lastError = getErrorMessage(error);
        this._clearHealthTimer();
        await this._safeDisconnect();
        this.emit('disconnected', { error: this._lastError });
        this.emit('deviceError', error);
        await this._logger.error('Device disconnected', { error: this._lastError });
        this.emit('state', this.getStatus());
      }

      if (!this._running) {
        break;
      }

      this._reconnectAttempt += 1;
      const delay = Math.min(60000, 1000 * 2 ** Math.min(this._reconnectAttempt, 5));
      await this._logger.info('Device reconnect scheduled', {
        attempt: this._reconnectAttempt,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  /**
   * @param {import('../../types/attendance').DeviceEndpoint} endpoint
   */
  async _connectAndListen(endpoint) {
    const useMock = isMockDeviceEnabled() || isMockDeviceIp(endpoint.ip);
    const candidates = useMock
      ? [{ create: () => new MockZkAdapter(endpoint) }]
      : [
          { create: () => new ZktecoJsAdapter(endpoint) },
          { create: () => new NodeZkLibAdapter(endpoint) },
        ];

    let lastError = null;

    for (const candidate of candidates) {
      if (!this._running) {
        return;
      }

      const adapter = candidate.create();
      let sessionStarted = false;

      try {
        await adapter.connect();
        sessionStarted = true;
        this._adapter = adapter;
        this._adapterName = adapter.name;
        this._connected = true;
        this._reconnectAttempt = 0;
        this._lastError = null;
        this._lastConnectedAt = new Date().toISOString();
        this.emit('connected', { adapter: adapter.name, ip: endpoint.ip });
        await this._logger.info('Device connected', { adapter: adapter.name, ip: endpoint.ip });
        this.emit('state', this.getStatus());
        this._startHealthMonitor(adapter);

        const onPunch = (punch) => this._handlePunch(punch);
        adapter.onUnparsedPunch = (raw) => {
          void this._logger.info('Punch payload ignored', {
            adapter: adapter.name,
            raw: summarizePunchRaw(raw),
          });
        };
        adapter.onPollSeeded = (meta) => {
          void this._logger.info('Attendance poll seeded', {
            adapter: adapter.name,
            total: meta.total,
            tracked: meta.tracked,
            ignored: meta.ignored,
          });
        };

        // Polling is the reliable path across ZK firmwares.
        // Realtime often stays "connected" forever without ever delivering punches,
        // and concurrent getInfo during realtime can also stall the event stream.
        this._mode = 'polling';
        this.emit('state', this.getStatus());
        await this._logger.info('Device listening (polling)', {
          adapter: adapter.name,
          intervalMs: 1500,
        });
        this._pollSignal = { stopped: false };
        await adapter.listenByPolling(onPunch, {
          intervalMs: 1500,
          signal: this._pollSignal,
        });

        throw new Error('Device listener ended.');
      } catch (error) {
        this._clearHealthTimer();
        try {
          if (adapter.stopRealtime) {
            adapter.stopRealtime();
          }
        } catch (_stopError) {
          // ignore
        }
        try {
          await adapter.disconnect();
        } catch (_disconnectError) {
          // ignore
        }
        this._adapter = null;
        this._connected = false;

        // After a live session, bubble up so the outer loop reconnects with backoff.
        if (sessionStarted) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError || new Error('All device adapters failed.');
  }

  /**
   * Inject a fake punch (macOS / local testing without ZK hardware).
   * Goes through the same path as a real device event.
   * @param {{ employeeId: string, attTime?: string }} input
   * @returns {Promise<import('../../types/attendance').AttendancePunch>}
   */
  async injectPunch(input) {
    const employeeId = String((input && input.employeeId) || '').trim();
    if (!employeeId) {
      throw new AppError('Employee ID is required.', 400, 'EMPLOYEE_ID_REQUIRED');
    }

    const raw = {
      userId: employeeId,
      attTime: (input && input.attTime) || new Date().toISOString(),
    };

    // Prefer queuing into the mock adapter so polling/normalize are exercised.
    if (this._adapter && this._adapter.name === 'mock' && typeof this._adapter.enqueuePunch === 'function') {
      this._adapter.enqueuePunch(raw);
      await sleep(600);
      const recent = this._recentPunches[0];
      if (recent && recent.employeeId === employeeId) {
        return recent;
      }
    }

    const punch = normalizePunch(raw, (this._adapter && this._adapter.endpoint.ip) || 'mock', 'simulate');
    if (!punch) {
      throw new AppError('Could not normalize simulated punch.', 400, 'PUNCH_NORMALIZE_FAILED');
    }
    this._handlePunch(punch);
    return punch;
  }

  /**
   * @param {import('../../types/attendance').AttendancePunch} punch
   */
  _handlePunch(punch) {
    this._recentPunches.unshift(punch);
    if (this._recentPunches.length > 50) {
      this._recentPunches.length = 50;
    }
    this.emit('punch', punch);
    void this._logger.info('Attendance received', {
      employeeId: punch.employeeId,
      deviceIp: punch.deviceIp,
      source: punch.source,
    });
  }

  /**
   * @param {InstanceType<typeof ZktecoJsAdapter> | InstanceType<typeof NodeZkLibAdapter>} adapter
   */
  _startHealthMonitor(adapter) {
    this._clearHealthTimer();
    this._healthTimer = setInterval(() => {
      void (async () => {
        if (!this._running || this._adapter !== adapter) {
          return;
        }
        try {
          await adapter.getInfo();
        } catch (error) {
          this._lastError = error.message || String(error);
          try {
            adapter.stopRealtime();
          } catch (_error) {
            // ignore
          }
          this._pollSignal.stopped = true;
          await this._safeDisconnect();
        }
      })();
    }, 30000);
  }

  _clearHealthTimer() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  async _safeDisconnect() {
    const adapter = this._adapter;
    this._adapter = null;
    this._connected = false;
    this._pollSignal.stopped = true;
    if (!adapter) {
      return;
    }
    try {
      if (adapter.stopRealtime) {
        adapter.stopRealtime();
      }
    } catch (_error) {
      // ignore
    }
    try {
      await adapter.disconnect();
    } catch (_error) {
      // ignore
    }
  }
}

module.exports = {
  ZktecoService,
};

/**
 * @param {unknown} raw
 * @returns {object | string}
 */
function summarizePunchRaw(raw) {
  if (!raw || typeof raw !== 'object') {
    return String(raw);
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  const keys = Object.keys(record).slice(0, 12);
  const out = {};
  for (const key of keys) {
    const value = record[key];
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = typeof value;
    }
  }
  return out;
}
