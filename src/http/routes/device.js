'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   zktecoService: import('../../services/zkteco/ZktecoService').ZktecoService,
 *   attendanceOrchestrator?: import('../../services/orchestrator/AttendanceOrchestrator').AttendanceOrchestrator,
 * }} deps
 */
function createDeviceRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.post('/test-device', gate, async (req, res, next) => {
    try {
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
      const result = await deps.attendanceOrchestrator.testType(employeeId);
      res.json({
        ok: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/restart', gate, async (req, res, next) => {
    try {
      await deps.zktecoService.restart();
      res.json({
        ok: true,
        data: {
          message: 'Device service restarted.',
          device: deps.zktecoService.getStatus(),
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
