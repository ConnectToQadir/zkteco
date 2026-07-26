'use strict';

/**
 * Receives attendance punches and drives typing with duplicate + license checks.
 */
class AttendanceOrchestrator {
  /**
   * @param {{
   *   configService: import('../config/ConfigService').ConfigService,
   *   zktecoService: import('../zkteco/ZktecoService').ZktecoService,
   *   keyboardTypingService: import('../keyboard/KeyboardTypingService').KeyboardTypingService,
   *   duplicateFilter: import('../keyboard/DuplicatePunchFilter').DuplicatePunchFilter,
   *   licenseGate: import('../license/LicenseTypingGate').LicenseTypingGate,
   *   logger?: { info: Function, error: Function },
   * }} deps
   */
  constructor(deps) {
    this._configService = deps.configService;
    this._zktecoService = deps.zktecoService;
    this._keyboardTypingService = deps.keyboardTypingService;
    this._duplicateFilter = deps.duplicateFilter;
    this._licenseGate = deps.licenseGate;
    this._logger = deps.logger || {
      info: async () => {},
      error: async () => {},
    };
    this._started = false;
    this._skippedDuplicates = 0;
    this._skippedUnlicensed = 0;
    this._errors = 0;
  }

  start() {
    if (this._started) {
      return;
    }
    this._started = true;
    this._zktecoService.on('punch', (punch) => {
      void this.handlePunch(punch);
    });
  }

  /**
   * @returns {object}
   */
  getStatus() {
    return {
      started: this._started,
      skippedDuplicates: this._skippedDuplicates,
      skippedUnlicensed: this._skippedUnlicensed,
      errors: this._errors,
      typing: this._keyboardTypingService.getStatus(),
    };
  }

  /**
   * @param {import('../../types/attendance').AttendancePunch} punch
   */
  async handlePunch(punch) {
    try {
      const config = await this._configService.load();
      const license = await this._licenseGate.canType();
      if (!license.allowed) {
        this._skippedUnlicensed += 1;
        await this._logger.info('Typing blocked by license', {
          employeeId: punch.employeeId,
          reason: license.reason || 'unlicensed',
        });
        return;
      }

      const decision = this._duplicateFilter.evaluate(
        punch.employeeId,
        config.duplicateSeconds,
      );
      if (!decision.allow) {
        this._skippedDuplicates += 1;
        await this._logger.info('Duplicate punch ignored', {
          employeeId: punch.employeeId,
          reason: decision.reason,
          remainingMs: decision.remainingMs,
        });
        return;
      }

      // Mark before typing to collapse bursts that arrive while a type job is queued.
      this._duplicateFilter.markTyped(punch.employeeId);

      await this._keyboardTypingService.typeEmployeeId(punch.employeeId, {
        delayMs: config.typingDelay,
        pressEnter: config.pressEnter,
      });
    } catch (error) {
      this._errors += 1;
      await this._logger.error('Failed to handle attendance punch', {
        employeeId: punch && punch.employeeId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Manual test helper (settings UI / API).
   * @param {string} employeeId
   */
  async testType(employeeId) {
    const config = await this._configService.load();
    const license = await this._licenseGate.canType();
    if (!license.allowed) {
      return {
        success: false,
        message: license.reason || 'Typing is blocked until a valid license is installed.',
      };
    }

    await this._keyboardTypingService.typeEmployeeId(String(employeeId || '').trim(), {
      delayMs: config.typingDelay,
      pressEnter: config.pressEnter,
    });

    return {
      success: true,
      message:
        process.platform === 'win32'
          ? `Typed "${employeeId}" into the focused window.`
          : `Stub-typed "${employeeId}" (real key injection runs on Windows only).`,
    };
  }
}

module.exports = {
  AttendanceOrchestrator,
};
