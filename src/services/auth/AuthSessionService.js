'use strict';

const crypto = require('crypto');
const { AppError } = require('../../utils/errors');

/**
 * In-memory unlock sessions for the local settings UI.
 * Tokens live only for the process lifetime.
 */
class AuthSessionService {
  /**
   * @param {{ ttlMs?: number }} [options]
   */
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || 30 * 60 * 1000;
    /** @type {Map<string, number>} */
    this._sessions = new Map();
  }

  /**
   * @returns {string}
   */
  createSession() {
    this._purgeExpired();
    const token = crypto.randomBytes(32).toString('hex');
    this._sessions.set(token, Date.now() + this._ttlMs);
    return token;
  }

  /**
   * @param {string | undefined} token
   * @returns {boolean}
   */
  isValid(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }
    this._purgeExpired();
    const expiresAt = this._sessions.get(token);
    if (!expiresAt) {
      return false;
    }
    if (Date.now() > expiresAt) {
      this._sessions.delete(token);
      return false;
    }
    return true;
  }

  /**
   * @param {string | undefined} token
   */
  assertValid(token) {
    if (!this.isValid(token)) {
      throw new AppError('Settings unlock required.', 401, 'AUTH_REQUIRED');
    }
  }

  /**
   * @param {string | undefined} token
   */
  revoke(token) {
    if (token) {
      this._sessions.delete(token);
    }
  }

  _purgeExpired() {
    const now = Date.now();
    for (const [token, expiresAt] of this._sessions.entries()) {
      if (now > expiresAt) {
        this._sessions.delete(token);
      }
    }
  }
}

module.exports = {
  AuthSessionService,
};
