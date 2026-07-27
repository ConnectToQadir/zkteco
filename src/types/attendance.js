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

  // Prefer badge / PIN fields. `uid` is often an internal index, so keep it last.
  const employeeId = pickEmployeeId(record);

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
    record.record_time ??
    record.timestamp ??
    record.time ??
    record.dateTime ??
    record.DateTime ??
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

/**
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
function pickEmployeeId(record) {
  const candidates = [
    record.deviceUserId,
    record.userId,
    record.userid,
    record.user_id,
    record.pin,
    record.PIN,
    record.badge,
    record.employeeId,
    record.employee_id,
    record.id,
    record.uid,
  ];

  for (const candidate of candidates) {
    if (candidate == null || candidate === '') {
      continue;
    }
    const value = String(candidate).trim();
    if (value) {
      return value;
    }
  }
  return '';
}

module.exports = {
  normalizePunch,
};
