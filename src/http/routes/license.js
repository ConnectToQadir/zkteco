'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');
const { AppError } = require('../../utils/errors');

/**
 * @param {{
 *   licenseService: import('../../services/license/LicenseService').LicenseService,
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 * }} deps
 */
function createLicenseRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.get('/license', async (req, res, next) => {
    try {
      const force = String(req.query.refresh || '') === '1';
      const info = await deps.licenseService.getInfo({ force });
      res.json({
        ok: true,
        data: {
          machineId: info.machineId,
          customerName: info.customerName,
          status: info.status,
          valid: info.valid,
          productVersion: info.productVersion,
          issuedAt: info.issuedAt,
          featureFlags: info.featureFlags,
          message: info.message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Activate by uploading license.dat contents from Settings UI.
   * Body: { content: "<license.dat text>" }
   */
  router.post('/license/upload', gate, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        throw new AppError('Please select a license file to upload.', 400, 'LICENSE_EMPTY');
      }

      // Guard oversized uploads (license.dat is tiny)
      if (content.length > 64 * 1024) {
        throw new AppError('License file is too large.', 400, 'LICENSE_TOO_LARGE');
      }

      const info = await deps.licenseService.installLicense(content);
      res.json({
        ok: true,
        data: {
          machineId: info.machineId,
          customerName: info.customerName,
          status: info.status,
          valid: info.valid,
          productVersion: info.productVersion,
          issuedAt: info.issuedAt,
          featureFlags: info.featureFlags,
          message: info.valid
            ? 'License uploaded and activated successfully.'
            : info.message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createLicenseRouter,
};
