'use strict';

/**
 * Parse ADMS ATTLOG / RTLOG tab-separated attendance bodies.
 * Format: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t ...
 */

/**
 * @param {string} body
 * @returns {string[]}
 */
function splitRows(body) {
  const rows = [];
  for (const line of body.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      rows.push(trimmed);
    }
  }
  return rows;
}

/**
 * @param {string} raw
 * @returns {Date | null}
 */
function parseTimestamp(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (isoMatch) {
    const local = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      Number(isoMatch[4]),
      Number(isoMatch[5]),
      Number(isoMatch[6]),
    );
    if (!Number.isNaN(local.getTime())) {
      return local;
    }
  }

  const slashMatch = value.match(
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (slashMatch) {
    const local = new Date(
      Number(slashMatch[1]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[3]),
      Number(slashMatch[4]),
      Number(slashMatch[5]),
      Number(slashMatch[6]),
    );
    if (!Number.isNaN(local.getTime())) {
      return local;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @param {string[]} fields
 * @param {number} index
 * @param {number} fallback
 * @returns {number}
 */
function intField(fields, index, fallback) {
  const value = String(fields[index] || '').trim();
  if (!value) {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * @param {string} line
 * @returns {{ userId: string, recordedAt: Date, status: number, verify: number } | null}
 */
function parseAttlogLine(line) {
  const fields = line.split('\t');
  const userId = String(fields[0] || '').trim();
  const recordedAt = parseTimestamp(fields[1] || '');
  if (!userId || !recordedAt) {
    return null;
  }
  return {
    userId,
    recordedAt,
    status: intField(fields, 2, 255),
    verify: intField(fields, 3, -1),
  };
}

/**
 * @param {string} line
 * @returns {{ userId: string, recordedAt: Date, status: number, verify: number } | null}
 */
function parseRtlogLine(line) {
  const fields = line.split('\t');
  const userId = String(fields[0] || '').trim();
  if (!userId) {
    return null;
  }

  let timeIndex = null;
  for (let i = 1; i < fields.length; i += 1) {
    if (parseTimestamp(fields[i]) !== null) {
      timeIndex = i;
      break;
    }
  }

  if (timeIndex === null) {
    return null;
  }

  const recordedAt = parseTimestamp(fields[timeIndex]);
  if (!recordedAt) {
    return null;
  }

  return {
    userId,
    recordedAt,
    status: intField(fields, timeIndex + 1, 255),
    verify: intField(fields, timeIndex + 2, -1),
  };
}

/**
 * @param {string} body
 * @param {'attlog' | 'rtlog'} kind
 * @returns {Array<{ userId: string, recordedAt: Date, status: number, verify: number }>}
 */
function parseAttlogBody(body, kind = 'attlog') {
  const parser = kind === 'rtlog' ? parseRtlogLine : parseAttlogLine;
  const records = [];
  for (const line of splitRows(body)) {
    const record = parser(line);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

module.exports = {
  parseAttlogBody,
  parseTimestamp,
};
