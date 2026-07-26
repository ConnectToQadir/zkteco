'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalJson } = require('../../utils/canonicalJson');
const { AppError } = require('../../utils/errors');
const { resolveFromRoot } = require('../../utils/paths');

/**
 * RSA-SHA256 verification using the embedded public key only.
 */
class RsaVerifier {
  /**
   * @param {{ publicKeyPath?: string, publicKeyPem?: string }} [options]
   */
  constructor(options = {}) {
    this._publicKeyPem =
      options.publicKeyPem ||
      fs.readFileSync(options.publicKeyPath || this._defaultPublicKeyPath(), 'utf8');
  }

  _defaultPublicKeyPath() {
    const candidates = [
      path.join(__dirname, '..', '..', 'keys', 'public.pem'),
      resolveFromRoot('src', 'keys', 'public.pem'),
      resolveFromRoot('keys', 'public.pem'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new AppError('RSA public key not found.', 500, 'LICENSE_PUBLIC_KEY_MISSING');
  }

  /**
   * @param {object} payload
   * @param {string} signatureBase64
   * @returns {boolean}
   */
  verify(payload, signatureBase64) {
    if (!payload || typeof signatureBase64 !== 'string' || !signatureBase64) {
      return false;
    }
    try {
      const data = Buffer.from(canonicalJson(payload), 'utf8');
      const signature = Buffer.from(signatureBase64, 'base64');
      return crypto.verify('RSA-SHA256', data, this._publicKeyPem, signature);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Seller-side helper (generator tool). Not used by the customer app.
   * @param {object} payload
   * @param {string} privateKeyPem
   * @returns {string} base64 signature
   */
  static sign(payload, privateKeyPem) {
    if (!privateKeyPem || !privateKeyPem.includes('PRIVATE KEY')) {
      throw new AppError('Private key is required for signing.', 500, 'LICENSE_SIGN_KEY');
    }
    const data = Buffer.from(canonicalJson(payload), 'utf8');
    return crypto.sign('RSA-SHA256', data, privateKeyPem).toString('base64');
  }
}

module.exports = {
  RsaVerifier,
};
