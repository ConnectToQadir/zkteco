'use strict';

const express = require('express');

/**
 * @param {{
 *   configService: import('../../services/config/ConfigService').ConfigService,
 *   zktecoService: import('../../services/zkteco/ZktecoService').ZktecoService,
 *   attendanceOrchestrator?: import('../../services/orchestrator/AttendanceOrchestrator').AttendanceOrchestrator,
 *   windowsStartupService?: import('../../services/startup/WindowsStartupService').WindowsStartupService,
 *   licenseService?: import('../../services/license/LicenseService').LicenseService,
 *   startedAt: number,
 *   productName: string,
 *   version: string,
 * }} deps
 */
function createStatusRouter(deps) {
  const router = express.Router();

  router.get('/status', async (req, res, next) => {
    try {
      const config = await deps.configService.getPublic();
      const device = deps.zktecoService.getStatus();
      const typing = deps.attendanceOrchestrator
        ? deps.attendanceOrchestrator.getStatus()
        : null;
      const startup = deps.windowsStartupService
        ? await deps.windowsStartupService.getStatus()
        : { supported: false, enabled: false };

      res.json({
        ok: true,
        data: {
          product: deps.productName,
          version: deps.version,
          uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
          httpPort: config.httpPort,
          pinConfigured: config.pinConfigured,
          device: {
            ip: config.deviceIp || null,
            port: config.devicePort,
            connected: device.connected,
            running: device.running,
            adapter: device.adapter,
            mode: device.mode,
            reconnectAttempt: device.reconnectAttempt,
            lastError: device.lastError,
            lastConnectedAt: device.lastConnectedAt,
            recentPunches: device.recentPunches.map((punch) => ({
              employeeId: punch.employeeId,
              punchedAt: punch.punchedAt,
              source: punch.source,
            })),
          },
          typing,
          startup,
          license: deps.licenseService
            ? await deps.licenseService.getInfo()
            : {
                status: 'unknown',
                note: 'License service unavailable',
              },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createStatusRouter,
};
