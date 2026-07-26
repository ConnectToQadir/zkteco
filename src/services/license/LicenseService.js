'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getLicensePath } = require('../../utils/paths');
const { AppError } = require('../../utils/errors');
const { HardwareFingerprint } = require('./HardwareFingerprint');
const { RsaVerifier } = require('./RsaVerifier');

/**
 * Loads and validates license.dat against this machine's fingerprint.
 * No expiry check in v1 (machine-bound only).
 */
class LicenseService {
  /**
   * @param {{
   *   licensePath?: string,
   *   fingerprint?: HardwareFingerprint,
   *   verifier?: RsaVerifier,
   *   productVersion?: string,
   *   logger?: { info: Function, error: Function },
   * }} [options]
   */
  constructor(options = {}) {
    this._licensePath = options.licensePath || getLicensePath();
    this._fingerprint = options.fingerprint || new HardwareFingerprint();
    this._verifier = options.verifier || new RsaVerifier();
    this._productVersion = options.productVersion || '1.0.0';
    this._logger = options.logger || {
      info: async () => {},
      error: async () => {},
    };
    /** @type {object | null} */
    this._cachedInfo = null;
    /** @type {number} */
    this._cachedAt = 0;
    this._cacheTtlMs = 30_000;
  }

  clearCache() {
    this._cachedInfo = null;
    this._cachedAt = 0;
  }

  /**
   * @returns {Promise<string>}
   */
  async getMachineId() {
    return this._fingerprint.getMachineId();
  }

  /**
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<object>}
   */
  async getInfo(options = {}) {
    if (
      !options.force &&
      this._cachedInfo &&
      Date.now() - this._cachedAt < this._cacheTtlMs
    ) {
      return { ...this._cachedInfo };
    }

    const machineId = await this.getMachineId();
    const result = await this._validateInternal(machineId);
    this._cachedInfo = result;
    this._cachedAt = Date.now();
    return { ...result };
  }

  /**
   * @returns {Promise<{ allowed: boolean, reason?: string, info: object }>}
   */
  async canType() {
    const info = await this.getInfo();
    if (info.status === 'valid') {
      return { allowed: true, info };
    }
    return {
      allowed: false,
      reason: info.message || 'License is not valid for this computer.',
      info,
    };
  }

  /**
   * Install a license file from Settings UI upload.
   * Validates signature + machine binding before writing to disk.
   * @param {string} content UTF-8 license.dat contents
   * @returns {Promise<object>} fresh license info
   */
  async installLicense(content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new AppError('License file content is empty.', 400, 'LICENSE_EMPTY');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_error) {
      throw new AppError('License file is not valid JSON.', 400, 'LICENSE_BAD_JSON');
    }

    const payload = parsed && parsed.payload;
    const signature = parsed && parsed.signature;
    if (!payload || typeof payload !== 'object' || typeof signature !== 'string') {
      throw new AppError('License file format is invalid.', 400, 'LICENSE_BAD_FORMAT');
    }

    if (!this._verifier.verify(payload, signature)) {
      await this._logger.error('License validation', { status: 'bad_signature', action: 'upload' });
      throw new AppError(
        'License signature is invalid. This file was not issued by us or was modified.',
        400,
        'LICENSE_BAD_SIGNATURE',
      );
    }

    const machineId = await this.getMachineId();
    const licensedFp = String(payload.machineFingerprint || '').toLowerCase();
    if (!licensedFp || licensedFp !== machineId.toLowerCase()) {
      await this._logger.error('License validation', {
        status: 'machine_mismatch',
        action: 'upload',
      });
      throw new AppError(
        'This license is not issued for this computer. Send your Machine ID when requesting a license.',
        400,
        'LICENSE_MACHINE_MISMATCH',
      );
    }

    const dir = path.dirname(this._licensePath);
    await fs.mkdir(dir, { recursive: true });

    const normalized = `${JSON.stringify(
      {
        payload,
        signature,
      },
      null,
      2,
    )}\n`;

    const tempPath = `${this._licensePath}.tmp`;
    await fs.writeFile(tempPath, normalized, 'utf8');
    await fs.rename(tempPath, this._licensePath);

    this.clearCache();
    await this._logger.info('License validation', {
      status: 'installed',
      customerName: payload.customerName,
    });

    return this.getInfo({ force: true });
  }

  /**
   * @param {string} machineId
   * @returns {Promise<object>}
   */
  async _validateInternal(machineId) {
    let raw;
    try {
      raw = await fs.readFile(this._licensePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        await this._logger.info('License validation', { status: 'missing' });
        return {
          status: 'missing',
          valid: false,
          machineId,
          customerName: null,
          productVersion: null,
          issuedAt: null,
          featureFlags: {},
          message: 'No license.dat found. Typing is disabled until licensed.',
        };
      }
      await this._logger.error('License validation', { status: 'read_error', error: error.message });
      return {
        status: 'error',
        valid: false,
        machineId,
        customerName: null,
        productVersion: null,
        issuedAt: null,
        featureFlags: {},
        message: 'Unable to read license file.',
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      await this._logger.error('License validation', { status: 'corrupt' });
      return this._invalid(machineId, 'corrupt', 'License file is corrupt or not valid JSON.');
    }

    const payload = parsed && parsed.payload;
    const signature = parsed && parsed.signature;
    if (!payload || typeof payload !== 'object' || typeof signature !== 'string') {
      return this._invalid(machineId, 'invalid_format', 'License file format is invalid.');
    }

    if (!this._verifier.verify(payload, signature)) {
      await this._logger.error('License validation', { status: 'bad_signature' });
      return this._invalid(
        machineId,
        'invalid_signature',
        'License signature is invalid (file may have been modified).',
      );
    }

    const licensedFp = String(payload.machineFingerprint || '');
    if (!licensedFp || licensedFp !== machineId) {
      await this._logger.error('License validation', {
        status: 'machine_mismatch',
      });
      return {
        status: 'machine_mismatch',
        valid: false,
        machineId,
        customerName: payload.customerName || null,
        productVersion: payload.productVersion || null,
        issuedAt: payload.issuedAt || null,
        featureFlags: payload.featureFlags || {},
        message: 'License is not issued for this Machine ID.',
      };
    }

    await this._logger.info('License validation', {
      status: 'valid',
      customerName: payload.customerName,
    });

    return {
      status: 'valid',
      valid: true,
      machineId,
      customerName: payload.customerName || null,
      productVersion: payload.productVersion || this._productVersion,
      issuedAt: payload.issuedAt || null,
      featureFlags: payload.featureFlags || {},
      message: 'License is valid for this computer.',
    };
  }

  /**
   * @param {string} machineId
   * @param {string} status
   * @param {string} message
   */
  _invalid(machineId, status, message) {
    return {
      status,
      valid: false,
      machineId,
      customerName: null,
      productVersion: null,
      issuedAt: null,
      featureFlags: {},
      message,
    };
  }
}

module.exports = {
  LicenseService,
};
