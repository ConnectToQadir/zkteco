'use strict';

const crypto = require('crypto');
const { AppError } = require('../../utils/errors');
const { getAppRoot } = require('../../utils/paths');

/** File magic identifies PunchType encrypted config v1. */
const MAGIC = Buffer.from('PTCFG1', 'ascii');
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

/**
 * Application secret material is split so a trivial string search is harder.
 * Phase 8 obfuscation will harden this further. Never a substitute for license crypto.
 */
function getSecretMaterial() {
  const parts = [
    Buffer.from([0x50, 0x75, 0x6e, 0x63, 0x68]), // Punch
    Buffer.from('Type', 'utf8'),
    Buffer.from([0x2f, 0x63, 0x66, 0x67, 0x2f]), // /cfg/
    Buffer.from('v1-aes-gcm', 'utf8'),
    Buffer.from([0x21, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74]), // !secret
  ];
  return Buffer.concat(parts);
}

/**
 * Derives a 256-bit AES key bound to this install location.
 * @param {string} [appRoot]
 * @returns {Promise<Buffer>}
 */
function deriveKey(appRoot = getAppRoot()) {
  const secret = getSecretMaterial();
  const salt = crypto.createHash('sha256').update(`punchtype-config|${appRoot}`).digest();

  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, KEY_LENGTH, SCRYPT_OPTS, (err, key) => {
      if (err) {
        reject(new AppError(`Config key derivation failed: ${err.message}`, 500, 'CONFIG_KEY_FAILED'));
        return;
      }
      resolve(key);
    });
  });
}

/**
 * Encrypts a UTF-8 JSON string into binary config.enc payload.
 * Layout: MAGIC | IV(12) | AUTH_TAG(16) | CIPHERTEXT
 * @param {string} plaintext
 * @param {Buffer} [key]
 * @returns {Promise<Buffer>}
 */
async function encryptToBuffer(plaintext, key) {
  if (typeof plaintext !== 'string') {
    throw new AppError('Config plaintext must be a string.', 500, 'CONFIG_ENCRYPT_INVALID');
  }

  const aesKey = key || (await deriveKey());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, authTag, encrypted]);
}

/**
 * Decrypts a config.enc binary payload to UTF-8 JSON string.
 * @param {Buffer} payload
 * @param {Buffer} [key]
 * @returns {Promise<string>}
 */
async function decryptFromBuffer(payload, key) {
  if (!Buffer.isBuffer(payload) || payload.length < MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new AppError('Encrypted configuration file is invalid or corrupted.', 500, 'CONFIG_CORRUPT');
  }

  const magic = payload.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new AppError('Encrypted configuration file has an unknown format.', 500, 'CONFIG_BAD_MAGIC');
  }

  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + AUTH_TAG_LENGTH;

  const iv = payload.subarray(ivStart, tagStart);
  const authTag = payload.subarray(tagStart, dataStart);
  const ciphertext = payload.subarray(dataStart);

  const aesKey = key || (await deriveKey());

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new AppError(
      'Failed to decrypt configuration. The file may be tampered or from another install.',
      500,
      'CONFIG_DECRYPT_FAILED',
    );
  }
}

/**
 * @param {object} configObject
 * @param {Buffer} [key]
 * @returns {Promise<Buffer>}
 */
async function encryptConfigObject(configObject, key) {
  return encryptToBuffer(JSON.stringify(configObject), key);
}

/**
 * @param {Buffer} payload
 * @param {Buffer} [key]
 * @returns {Promise<object>}
 */
async function decryptConfigObject(payload, key) {
  const json = await decryptFromBuffer(payload, key);
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch (_error) {
    throw new AppError('Decrypted configuration JSON is invalid.', 500, 'CONFIG_JSON_INVALID');
  }
}

module.exports = {
  MAGIC,
  deriveKey,
  encryptToBuffer,
  decryptFromBuffer,
  encryptConfigObject,
  decryptConfigObject,
};
