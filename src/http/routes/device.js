'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   zktecoService: import('../../services/zkteco/ZktecoService').ZktecoService,
 *   admsPushService?: import('../../services/adms/AdmsPushService').AdmsPushService,
 *   admsListenerManager?: import('../../services/adms/AdmsListenerManager').AdmsListenerManager,
 *   configService?: import('../../services/config/ConfigService').ConfigService,
 *   attendanceOrchestrator?: import('../../services/orchestrator/AttendanceOrchestrator').AttendanceOrchestrator,
 * }} deps
 */
function createDeviceRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.post('/test-device', gate, async (req, res, next) => {
    try {
      const config = deps.configService ? await deps.configService.load() : null;
      const pushMode =
        config && (config.connectionMode === 'push' || config.connectionMode === 'both');

      if (pushMode && deps.admsPushService) {
        const adms = deps.admsPushService.getStatus();
        const ok = adms.listening;
        res.json({
          ok: true,
          data: {
            success: ok,
            message: ok
              ? adms.connected
                ? `ADMS push listener is active on port ${adms.port}. Device is connected.`
                : `ADMS push listener is active on port ${adms.port}. Configure the device Cloud Server to this PC's IP and port, then reboot the device.`
              : 'ADMS push listener is not running. Save configuration with push mode enabled.',
            adapter: 'adms-push',
            info: adms,
          },
        });
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await deps.zktecoService.testConnection({
        ip: body.deviceIp,
        port: body.devicePort,
        password: body.devicePassword,
      });

      res.json({
        ok: true,
        data: {
          success: result.ok,
          message: result.message,
          adapter: result.adapter || null,
          info: result.info || null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/test-typing', gate, async (req, res, next) => {
    try {
      if (!deps.attendanceOrchestrator) {
        res.json({
          ok: true,
          data: { success: false, message: 'Typing service is not available.' },
        });
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const employeeId = body.employeeId || '105';
      const result = await deps.attendanceOrchestrator.testType(employeeId, {
        focusReady: Boolean(body.focusReady),
      });
      res.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Inject a fake punch (local/mac testing without ZK hardware).
   * Body: { employeeId: "105" }
   */
  router.post('/simulate-punch', gate, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const employeeId = body.employeeId || '105';
      const punch = await deps.zktecoService.injectPunch({ employeeId });

      // Give the orchestrator a moment to finish typing + logging.
      await new Promise((resolve) => setTimeout(resolve, 300));

      const typing = deps.attendanceOrchestrator
        ? deps.attendanceOrchestrator.getStatus().typing
        : null;

      res.json({
        ok: true,
        data: {
          success: true,
          message:
            process.platform === 'win32'
              ? `Simulated punch for "${punch.employeeId}". Check the focused window and logs.`
              : `Simulated punch for "${punch.employeeId}". On macOS keys are stubbed — check logs for Attendance received / Employee typed.`,
          punch: {
            employeeId: punch.employeeId,
            punchedAt: punch.punchedAt,
            source: punch.source,
          },
          typing,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/restart', gate, async (req, res, next) => {
    try {
      if (deps.configService && deps.admsListenerManager) {
        const config = await deps.configService.load();
        await deps.admsListenerManager.sync(config);
      }
      await deps.zktecoService.restart();
      res.json({
        ok: true,
        data: {
          message: 'Device and ADMS services restarted.',
          device: deps.zktecoService.getStatus(),
          adms: deps.admsPushService ? deps.admsPushService.getStatus() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createDeviceRouter,
};
