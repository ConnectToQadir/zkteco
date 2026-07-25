'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const { AppError } = require('../../utils/errors');
const {
  getConfigEncPath,
  getLegacyConfigJsonPath,
} = require('../../utils/paths');
const { createDefaultConfig, toPublicConfig } = require('./defaults');
const {
  encryptConfigObject,
  decryptConfigObject,
} = require('./ConfigCrypto');

const PIN_SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

/**
 * Encrypted configuration service.
 * Persists to config.enc (AES-256-GCM). Migrates legacy config.json once.
 */
class ConfigService {
  /**
   * @param {{
   *   configPath?: string,
   *   legacyConfigPath?: string,
   * }} [options]
   */
  constructor(options = {}) {
    this._configPath = options.configPath || getConfigEncPath();
    this._legacyConfigPath = options.legacyConfigPath || getLegacyConfigJsonPath();
    /** @type {import('./defaults').AppConfig | null} */
    this._cache = null;
  }

  /**
   * @returns {Promise<import('./defaults').AppConfig>}
   */
  async load() {
    if (this._cache) {
      return { ...this._cache };
    }

    try {
      const encrypted = await fs.readFile(this._configPath);
      const parsed = await decryptConfigObject(encrypted);
      this._cache = this._normalize(parsed);
      return { ...this._cache };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const migrated = await this._tryMigrateLegacyJson();
        if (migrated) {
          return { ...this._cache };
        }

        this._cache = createDefaultConfig();
        await this._persist(this._cache);
        return { ...this._cache };
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(`Failed to load configuration: ${error.message}`, 500, 'CONFIG_LOAD_FAILED');
    }
  }

  /**
   * @param {Partial<import('./defaults').AppConfig>} patch
   * @returns {Promise<import('./defaults').AppConfig>}
   */
  async save(patch) {
    const current = await this.load();
    const next = this._normalize({ ...current, ...patch });
    this._validate(next);
    await this._persist(next);
    this._cache = next;
    return { ...next };
  }

  /**
   * @returns {Promise<object>}
   */
  async getPublic() {
    const config = await this.load();
    return toPublicConfig(config);
  }

  /**
   * @returns {Promise<boolean>}
   */
  async isPinConfigured() {
    const config = await this.load();
    return Boolean(config.settingsPinHash && config.settingsPinSalt);
  }

  /**
   * @param {string} pin
   * @returns {Promise<void>}
   */
  async setupPin(pin) {
    this._assertPinFormat(pin);
    if (await this.isPinConfigured()) {
      throw new AppError('PIN is already configured. Use change PIN instead.', 400, 'PIN_ALREADY_SET');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await this._hashPin(pin, salt);
    await this.save({
      settingsPinSalt: salt,
      settingsPinHash: hash,
    });
  }

  /**
   * @param {string} currentPin
   * @param {string} newPin
   * @returns {Promise<void>}
   */
  async changePin(currentPin, newPin) {
    const ok = await this.verifyPin(currentPin);
    if (!ok) {
      throw new AppError('Current PIN is incorrect.', 401, 'PIN_INVALID');
    }
    this._assertPinFormat(newPin);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await this._hashPin(newPin, salt);
    await this.save({
      settingsPinSalt: salt,
      settingsPinHash: hash,
    });
  }

  /**
   * @param {string} pin
   * @returns {Promise<boolean>}
   */
  async verifyPin(pin) {
    const config = await this.load();
    if (!config.settingsPinHash || !config.settingsPinSalt) {
      return false;
    }
    if (typeof pin !== 'string' || pin.length === 0) {
      return false;
    }

    const candidate = await this._hashPin(pin, config.settingsPinSalt);
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(config.settingsPinHash, 'hex');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  clearCache() {
    this._cache = null;
  }

  /**
   * @returns {Promise<boolean>} true when migration succeeded
   */
  async _tryMigrateLegacyJson() {
    try {
      const raw = await fs.readFile(this._legacyConfigPath, 'utf8');
      const parsed = JSON.parse(raw);
      this._cache = this._normalize(parsed);
      await this._persist(this._cache);
      await this._removeLegacyJson();
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return false;
      }
      throw new AppError(
        `Failed to migrate legacy configuration: ${error.message}`,
        500,
        'CONFIG_MIGRATE_FAILED',
      );
    }
  }

  async _removeLegacyJson() {
    try {
      await fs.unlink(this._legacyConfigPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        // Non-fatal: encrypted file is source of truth after migration.
        // eslint-disable-next-line no-console
        console.warn('[PunchType] Could not remove legacy config.json:', error.message);
      }
    }
  }

  /**
   * @param {import('./defaults').AppConfig} config
   * @returns {Promise<void>}
   */
  async _persist(config) {
    const payload = await encryptConfigObject(config);
    const tempPath = `${this._configPath}.tmp`;
    await fs.writeFile(tempPath, payload);
    await fs.rename(tempPath, this._configPath);
  }

  /**
   * @param {object} input
   * @returns {import('./defaults').AppConfig}
   */
  _normalize(input) {
    const defaults = createDefaultConfig();
    const source = input && typeof input === 'object' ? input : {};

    return {
      deviceIp: typeof source.deviceIp === 'string' ? source.deviceIp.trim() : defaults.deviceIp,
      devicePort: this._toInt(source.devicePort, defaults.devicePort),
      devicePassword:
        typeof source.devicePassword === 'string' ? source.devicePassword : defaults.devicePassword,
      httpPort: this._toInt(source.httpPort, defaults.httpPort),
      typingDelay: this._toInt(source.typingDelay, defaults.typingDelay),
      duplicateSeconds: this._toInt(source.duplicateSeconds, defaults.duplicateSeconds),
      pressEnter: this._toBool(source.pressEnter, defaults.pressEnter),
      autoStart: this._toBool(source.autoStart, defaults.autoStart),
      logging: this._toBool(source.logging, defaults.logging),
      settingsPinHash:
        typeof source.settingsPinHash === 'string' ? source.settingsPinHash : defaults.settingsPinHash,
      settingsPinSalt:
        typeof source.settingsPinSalt === 'string' ? source.settingsPinSalt : defaults.settingsPinSalt,
    };
  }

  /**
   * @param {import('./defaults').AppConfig} config
   */
  _validate(config) {
    if (config.deviceIp && !this._isValidIpOrHost(config.deviceIp)) {
      throw new AppError('Device IP/host is invalid.', 400, 'INVALID_DEVICE_IP');
    }
    if (config.devicePort < 1 || config.devicePort > 65535) {
      throw new AppError('Device port must be between 1 and 65535.', 400, 'INVALID_DEVICE_PORT');
    }
    if (config.httpPort < 1 || config.httpPort > 65535) {
      throw new AppError('HTTP port must be between 1 and 65535.', 400, 'INVALID_HTTP_PORT');
    }
    if (config.typingDelay < 0 || config.typingDelay > 5000) {
      throw new AppError('Typing delay must be between 0 and 5000 ms.', 400, 'INVALID_TYPING_DELAY');
    }
    if (config.duplicateSeconds < 0 || config.duplicateSeconds > 3600) {
      throw new AppError('Duplicate seconds must be between 0 and 3600.', 400, 'INVALID_DUPLICATE_SECONDS');
    }
  }

  /**
   * @param {string} pin
   */
  _assertPinFormat(pin) {
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
      throw new AppError('PIN must be 4 to 8 digits.', 400, 'INVALID_PIN_FORMAT');
    }
  }

  /**
   * @param {string} pin
   * @param {string} saltHex
   * @returns {Promise<string>}
   */
  _hashPin(pin, saltHex) {
    return new Promise((resolve, reject) => {
      crypto.scrypt(pin, Buffer.from(saltHex, 'hex'), 32, PIN_SCRYPT_OPTS, (err, derived) => {
        if (err) {
          reject(new AppError(`PIN hashing failed: ${err.message}`, 500, 'PIN_HASH_FAILED'));
          return;
        }
        resolve(derived.toString('hex'));
      });
    });
  }

  /**
   * @param {unknown} value
   * @param {number} fallback
   * @returns {number}
   */
  _toInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  /**
   * @param {unknown} value
   * @param {boolean} fallback
   * @returns {boolean}
   */
  _toBool(value, fallback) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return fallback;
  }

  /**
   * @param {string} value
   * @returns {boolean}
   */
  _isValidIpOrHost(value) {
    if (!value || value.length > 253) {
      return false;
    }
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      return value.split('.').every((part) => {
        const n = Number(part);
        return n >= 0 && n <= 255;
      });
    }
    return /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/.test(
      value,
    );
  }
}

module.exports = {
  ConfigService,
};
