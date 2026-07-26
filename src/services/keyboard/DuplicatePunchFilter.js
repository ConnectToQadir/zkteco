'use strict';

/**
 * Ignores repeated punches for the same employee within a time window.
 */
class DuplicatePunchFilter {
  constructor() {
    /** @type {Map<string, number>} */
    this._lastTypedAt = new Map();
  }

  /**
   * @param {string} employeeId
   * @param {number} duplicateSeconds
   * @param {number} [nowMs]
   * @returns {{ allow: boolean, reason?: string, remainingMs?: number }}
   */
  evaluate(employeeId, duplicateSeconds, nowMs = Date.now()) {
    const id = String(employeeId || '').trim();
    if (!id) {
      return { allow: false, reason: 'empty_employee_id' };
    }

    const windowMs = Math.max(0, Number(duplicateSeconds) || 0) * 1000;
    const last = this._lastTypedAt.get(id);

    if (last != null && windowMs > 0) {
      const elapsed = nowMs - last;
      if (elapsed < windowMs) {
        return {
          allow: false,
          reason: 'duplicate_within_window',
          remainingMs: windowMs - elapsed,
        };
      }
    }

    return { allow: true };
  }

  /**
   * Mark employee as typed now (call only after a successful type decision).
   * @param {string} employeeId
   * @param {number} [nowMs]
   */
  markTyped(employeeId, nowMs = Date.now()) {
    const id = String(employeeId || '').trim();
    if (!id) {
      return;
    }
    this._lastTypedAt.set(id, nowMs);

    // Bound memory for long-running process
    if (this._lastTypedAt.size > 5000) {
      const oldest = this._lastTypedAt.keys().next().value;
      this._lastTypedAt.delete(oldest);
    }
  }

  clear() {
    this._lastTypedAt.clear();
  }
}

module.exports = {
  DuplicatePunchFilter,
};
