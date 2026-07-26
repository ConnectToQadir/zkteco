'use strict';

const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const si = require('systeminformation');

const execFileAsync = promisify(execFile);

/**
 * Builds a stable hardware fingerprint / Machine ID (SHA-256 hex).
 * Inputs: CPU, BIOS UUID, motherboard serial, disk serial, Windows Machine GUID, MAC.
 */
class HardwareFingerprint {
  constructor() {
    /** @type {string | null} */
    this._cached = null;
    /** @type {object | null} */
    this._cachedParts = null;
  }

  /**
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<string>}
   */
  async getMachineId(options = {}) {
    const { fingerprint } = await this.collect(options);
    return fingerprint;
  }

  /**
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ fingerprint: string, parts: Record<string, string> }>}
   */
  async collect(options = {}) {
    if (!options.force && this._cached && this._cachedParts) {
      return { fingerprint: this._cached, parts: { ...this._cachedParts } };
    }

    const [cpu, system, baseboard, disks, net, machineGuid] = await Promise.all([
      this._safe(() => si.cpu(), {}),
      this._safe(() => si.system(), {}),
      this._safe(() => si.baseboard(), {}),
      this._safe(() => si.diskLayout(), []),
      this._safe(() => si.networkInterfaces(), []),
      this._readWindowsMachineGuid(),
    ]);

    const primaryDisk = Array.isArray(disks) && disks.length ? disks[0] : {};
    const mac = this._pickMac(net);

    const parts = {
      cpu: this._clean(
        [cpu.manufacturer, cpu.brand, cpu.family, cpu.model, cpu.stepping]
          .filter(Boolean)
          .join('|'),
      ),
      biosUuid: this._clean(system.uuid || ''),
      motherboardSerial: this._clean(baseboard.serial || system.serial || ''),
      diskSerial: this._clean(primaryDisk.serialNum || primaryDisk.serial || ''),
      windowsMachineGuid: this._clean(machineGuid),
      mac: this._clean(mac),
    };

    const canonical = [
      `cpu=${parts.cpu}`,
      `biosUuid=${parts.biosUuid}`,
      `motherboardSerial=${parts.motherboardSerial}`,
      `diskSerial=${parts.diskSerial}`,
      `windowsMachineGuid=${parts.windowsMachineGuid}`,
      `mac=${parts.mac}`,
    ].join('\n');

    const fingerprint = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    this._cached = fingerprint;
    this._cachedParts = parts;
    return { fingerprint, parts };
  }

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @param {T} fallback
   * @returns {Promise<T>}
   */
  async _safe(fn, fallback) {
    try {
      return await fn();
    } catch (_error) {
      return fallback;
    }
  }

  /**
   * @param {unknown} net
   * @returns {string}
   */
  _pickMac(net) {
    const list = Array.isArray(net) ? net : [];
    const preferred =
      list.find((n) => n && n.default && n.mac && n.mac !== '00:00:00:00:00:00') ||
      list.find(
        (n) =>
          n &&
          !n.internal &&
          n.mac &&
          n.mac !== '00:00:00:00:00:00' &&
          String(n.iface || '').toLowerCase() !== 'lo',
      );
    return preferred && preferred.mac ? String(preferred.mac).toLowerCase() : '';
  }

  /**
   * @returns {Promise<string>}
   */
  async _readWindowsMachineGuid() {
    if (process.platform !== 'win32') {
      // Stable-enough fallback for non-Windows development hosts.
      try {
        const uuid = await si.uuid();
        return String((uuid && (uuid.os || uuid.hardware)) || '');
      } catch (_error) {
        return '';
      }
    }

    try {
      const { stdout } = await execFileAsync('reg', [
        'query',
        'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
        '/v',
        'MachineGuid',
      ]);
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([^\s]+)/i);
      return match ? match[1].trim() : '';
    } catch (_error) {
      return '';
    }
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  _clean(value) {
    const text = String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!text || /^none$/i.test(text) || /^to be filled/i.test(text) || /^default string$/i.test(text)) {
      return '';
    }
    return text;
  }
}

module.exports = {
  HardwareFingerprint,
};
