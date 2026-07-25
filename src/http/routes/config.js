'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   configService: import('../../services/config/ConfigService').ConfigService,
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   zktecoService?: import('../../services/zkteco/ZktecoService').ZktecoService,
 * }} deps
 */
function createConfigRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.get('/config', gate, async (req, res, next) => {
    try {
      const config = await deps.configService.getPublic();
      res.json({ ok: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  router.post('/config', gate, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {
        deviceIp: body.deviceIp,
        devicePort: body.devicePort,
        httpPort: body.httpPort,
        typingDelay: body.typingDelay,
        duplicateSeconds: body.duplicateSeconds,
        pressEnter: body.pressEnter,
        autoStart: body.autoStart,
        logging: body.logging,
      };

      if (typeof body.devicePassword === 'string') {
        patch.devicePassword = body.devicePassword;
      }

      const previous = await deps.configService.load();
      const saved = await deps.configService.save(patch);
      const publicConfig = await deps.configService.getPublic();

      const deviceChanged =
        previous.deviceIp !== saved.deviceIp ||
        previous.devicePort !== saved.devicePort ||
        previous.devicePassword !== saved.devicePassword;

      if (deviceChanged && deps.zktecoService) {
        await deps.zktecoService.restart();
      }

      let message = 'Configuration saved.';
      if (previous.httpPort !== saved.httpPort) {
        message = 'Configuration saved. Restart PunchType to apply the new HTTP port.';
      } else if (deviceChanged) {
        message = 'Configuration saved. Device service restarted.';
      }

      res.json({
        ok: true,
        data: {
          config: publicConfig,
          httpPortChanged: previous.httpPort !== saved.httpPort,
          deviceRestarted: deviceChanged,
          message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createConfigRouter,
};
