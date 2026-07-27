'use strict';

const { EventEmitter } = require('events');
const { parseAttlogBody } = require('./parseAttlogBody');
const { normalizePunch } = require('../../types/attendance');
const { getErrorMessage } = require('../../utils/errors');

const DEFAULT_MAX_PUNCH_AGE_MS = 120000;
/** Treat device timestamps more than 5 minutes off PC clock as skewed. */
const CLOCK_SKEW_MS = 300000;
/** POST uploads with at most this many rows are live punches, not history sync. */
const LIVE_BATCH_MAX_ROWS = 3;

/**
 * Accepts ZKTeco ADMS / iclock PUSH uploads and emits normalized attendance punches.
 */
class AdmsPushService extends EventEmitter {
  /**
   * @param {{
   *   configService: import('../config/ConfigService').ConfigService,
   *   logger?: { info: Function, error: Function },
   *   maxPunchAgeMs?: number,
   * }} deps
   */
  constructor(deps) {
    super();
    this._configService = deps.configService;
    this._logger = deps.logger || {
      info: async () => {},
      error: async () => {},
    };
    this._maxPunchAgeMs = deps.maxPunchAgeMs || DEFAULT_MAX_PUNCH_AGE_MS;
    /** @type {Map<string, { serial: string, ip: string, lastSeenAt: number, pushVersion?: string, deviceType?: string, stamps: Record<string, string> }>} */
    this._devices = new Map();
    this._listening = false;
    this._port = null;
  }

  /**
   * @returns {object}
   */
  getStatus() {
    const devices = [...this._devices.values()].map((device) => ({
      serial: device.serial,
      ip: device.ip,
      lastSeenAt: device.lastSeenAt,
      pushVersion: device.pushVersion || null,
      deviceType: device.deviceType || null,
    }));

    const recentSeen = devices.some(
      (device) => device.lastSeenAt && Date.now() - device.lastSeenAt < 180000,
    );

    return {
      enabled: true,
      listening: this._listening,
      port: this._port,
      connected: recentSeen,
      deviceCount: devices.length,
      devices,
    };
  }

  /**
   * @param {boolean} listening
   * @param {number | null} port
   */
  setListening(listening, port = null) {
    this._listening = listening;
    this._port = port;
    this.emit('state', this.getStatus());
  }

  /**
   * GET /iclock/cdata handshake — return options block for the device.
   * @param {import('express').Request} req
   * @returns {string}
   */
  handleCdataGet(req) {
    const serial = this._serialFromRequest(req);
    const ip = this._ipFromRequest(req);
    const device = this._touchDevice(serial, ip, {
      pushVersion: req.query.pushver,
      deviceType: req.query.DeviceType,
    });

    if (req.query.options === 'all' || req.query.options) {
      return this._configBlock(device);
    }

    return 'OK';
  }

  /**
   * POST /iclock/cdata — attendance and capability uploads.
   * @param {import('express').Request} req
   * @returns {Promise<string>}
   */
  async handleCdataPost(req) {
    const serial = this._serialFromRequest(req);
    const ip = this._ipFromRequest(req);
    const table = String(req.query.table || req.query.Table || '').toUpperCase();
    const body = typeof req.body === 'string' ? req.body : '';
    const stamp = req.query.Stamp || req.query.stamp;

    this._touchDevice(serial, ip, {
      pushVersion: req.query.pushver,
      deviceType: req.query.DeviceType,
    });

    if (!table || table === 'OPTIONS') {
      return 'OK';
    }

    if (table === 'ATTLOG' || table === 'RTLOG') {
      const kind = table === 'RTLOG' ? 'rtlog' : 'attlog';
      const records = parseAttlogBody(body, kind);
      const isLiveBatch = records.length > 0 && records.length <= LIVE_BATCH_MAX_ROWS;
      let accepted = 0;

      for (const record of records) {
        const acceptedOne = await this._emitRecord(record, ip, `adms-${kind}`, {
          isLiveBatch,
          batchSize: records.length,
        });
        if (acceptedOne) {
          accepted += 1;
        }
      }

      if (stamp) {
        this._updateStamp(serial, table, String(stamp));
      }

      return accepted > 0 ? `OK:${accepted}` : 'OK';
    }

    if (stamp) {
      this._updateStamp(serial, table, String(stamp));
    }

    return 'OK';
  }

  /**
   * @returns {string}
   */
  handleGetRequest() {
    return 'OK';
  }

  /**
   * @returns {string}
   */
  handleDeviceCmd() {
    return 'OK';
  }

  /**
   * @returns {string}
   */
  handleRegistry() {
    return 'RegistryCode=0\n';
  }

  /**
   * @param {import('express').Request} req
   * @returns {string}
   */
  _serialFromRequest(req) {
    const serial = req.query.SN || req.query.sn || req.query.serial || '';
    return String(serial).trim() || 'unknown';
  }

  /**
   * @param {import('express').Request} req
   * @returns {string}
   */
  _ipFromRequest(req) {
    const raw = req.socket.remoteAddress || '';
    return raw.replace(/^::ffff:/, '');
  }

  /**
   * @param {string} serial
   * @param {string} ip
   * @param {{ pushVersion?: string, deviceType?: string }} [meta]
   */
  _touchDevice(serial, ip, meta = {}) {
    const existing = this._devices.get(serial);
    const device = {
      serial,
      ip,
      lastSeenAt: Date.now(),
      pushVersion: meta.pushVersion || existing?.pushVersion,
      deviceType: meta.deviceType || existing?.deviceType,
      stamps: existing?.stamps ? { ...existing.stamps } : { ATTLOG: '0', OPERLOG: '0', RTLOG: '0' },
    };
    this._devices.set(serial, device);
    this.emit('state', this.getStatus());
    return device;
  }

  /**
   * @param {{ serial: string, stamps: Record<string, string> }} device
   * @returns {string}
   */
  _configBlock(device) {
    const attlog = device.stamps.ATTLOG || device.stamps.RTLOG || '0';
    const operlog = device.stamps.OPERLOG || '0';
    const lines = [
      `GET OPTION FROM: ${device.serial}`,
      `Stamp=${attlog}`,
      `OpStamp=${operlog}`,
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=1111111111',
      'Realtime=1',
      'Encrypt=0',
    ];
    return `${lines.join('\n')}\n`;
  }

  /**
   * @param {string} serial
   * @param {string} table
   * @param {string} stamp
   */
  _updateStamp(serial, table, stamp) {
    const device = this._devices.get(serial);
    if (!device || !stamp) {
      return;
    }
    device.stamps[table] = stamp;
    this._devices.set(serial, device);
  }

  /**
   * @param {{ userId: string, recordedAt: Date }} record
   * @param {string} deviceIp
   * @param {string} source
   * @param {{ isLiveBatch?: boolean, batchSize?: number }} [context]
   * @returns {Promise<boolean>}
   */
  async _emitRecord(record, deviceIp, source, context = {}) {
    const ageMs = Date.now() - record.recordedAt.getTime();
    const isRealtime = source === 'adms-rtlog' || context.isLiveBatch;

    if (!isRealtime) {
      if (ageMs > this._maxPunchAgeMs) {
        return false;
      }
    }

    const punchedAt =
      isRealtime && Math.abs(ageMs) > CLOCK_SKEW_MS ? new Date() : record.recordedAt;

    const punch = normalizePunch(
      {
        userId: record.userId,
        pin: record.userId,
        attTime: punchedAt.toISOString(),
      },
      deviceIp,
      source,
    );

    if (!punch) {
      return false;
    }

    this.emit('punch', punch);
    await this._logger.info('ADMS punch received', {
      employeeId: punch.employeeId,
      deviceIp: punch.deviceIp,
      source: punch.source,
    });
    return true;
  }
}

module.exports = {
  AdmsPushService,
  DEFAULT_MAX_PUNCH_AGE_MS,
};
