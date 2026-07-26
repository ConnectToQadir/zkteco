'use strict';

/**
 * Stable JSON for RSA signing — sorted object keys, no whitespace variance.
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue(/** @type {any} */ (value)[key]);
    }
    return out;
  }
  return value;
}

module.exports = {
  canonicalJson,
};
