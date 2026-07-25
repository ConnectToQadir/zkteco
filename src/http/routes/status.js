'use strict';

const express = require('express');

/**
 * @param {{
 *   configService: import('../../services/config/ConfigService').ConfigService,
 *   zktecoService: import('../../services/zkteco/ZktecoService').ZktecoService,
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
          license: {
            status: 'not_checked',
            note: 'License service arrives in Phase 7',
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
