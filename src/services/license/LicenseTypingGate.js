'use strict';

/**
 * Typing gate backed by LicenseService.
 * Unlicensed / invalid license → block typing only.
 */
class LicenseTypingGate {
  /**
   * @param {{ licenseService: import('./LicenseService').LicenseService }} deps
   */
  constructor(deps) {
    this._licenseService = deps.licenseService;
  }

  /**
   * @returns {Promise<{ allowed: boolean, reason?: string }>}
   */
  async canType() {
    const result = await this._licenseService.canType();
    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }
}

module.exports = {
  LicenseTypingGate,
};
