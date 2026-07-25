'use strict';

/**
 * Race a promise against a timeout.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} [message]
 * @returns {Promise<T>}
 */
async function withTimeout(promise, timeoutMs, message = 'Operation timed out.') {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  withTimeout,
};
