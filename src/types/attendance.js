'use strict';

/**
 * @typedef {Object} DeviceEndpoint
 * @property {string} ip
 * @property {number} port
 * @property {string} [password]
 * @property {number} [timeoutMs]
 * @property {number} [udpInPort]
 */

/**
 * @typedef {Object} AttendancePunch
 * @property {string} employeeId
 * @property {Date} punchedAt
 * @property {string} deviceIp
 * @property {string} source
 * @property {unknown} [raw]
 */

/**
 * @typedef {Object} DeviceTestResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [adapter]
 * @property {object} [info]
 */

/**
 * Normalized punch from various library payload shapes.
 * @param {unknown} raw
 * @param {string} deviceIp
 * @param {string} source
 * @returns {AttendancePunch | null}
 */
function normalizePunch(raw, deviceIp, source) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = /** @type {Record<string, unknown>} */ (raw);
  const employeeId = String(
    record.deviceUserId ??
      record.userId ??
      record.uid ??
      record.user_id ??
      record.id ??
      '',
  ).trim();

  if (!employeeId) {
    return null;
  }

  // Digits and alphanumeric badge IDs (architecture: alphanumeric)
  if (!/^[A-Za-z0-9_-]+$/.test(employeeId)) {
    return null;
  }

  const timeValue =
    record.recordTime ??
    record.attTime ??
    record.timestamp ??
    record.time ??
    record.dateTime ??
    null;

  let punchedAt = new Date();
  if (timeValue instanceof Date) {
    punchedAt = timeValue;
  } else if (typeof timeValue === 'string' || typeof timeValue === 'number') {
    const parsed = new Date(timeValue);
    if (!Number.isNaN(parsed.getTime())) {
      punchedAt = parsed;
    }
  }

  return {
    employeeId,
    punchedAt,
    deviceIp,
    source,
    raw,
  };
}

module.exports = {
  normalizePunch,
};
