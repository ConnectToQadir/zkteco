'use strict';

class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {string} [code='APP_ERROR']
   */
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Extract a readable message from ZK library / Node errors.
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object') {
    const obj = /** @type {Record<string, any>} */ (error);
    if (obj.code && (obj.syscall || obj.address)) {
      const where = obj.address ? `${obj.address}${obj.port ? `:${obj.port}` : ''}` : '';
      return `${obj.code}${obj.syscall ? ` ${obj.syscall}` : ''}${where ? ` ${where}` : ''}`.trim();
    }
    if (obj.message) {
      return String(obj.message);
    }
    if (obj.err) {
      return getErrorMessage(obj.err);
    }
    if (obj.error) {
      return getErrorMessage(obj.error);
    }
    try {
      return JSON.stringify(obj);
    } catch (_error) {
      return 'Unknown error object';
    }
  }
  return String(error);
}

module.exports = {
  AppError,
  getErrorMessage,
};
