'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   configService: import('../../services/config/ConfigService').ConfigService,
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   zktecoService?: import('../../services/zkteco/ZktecoService').ZktecoService,
 *   admsListenerManager?: import('../../services/adms/AdmsListenerManager').AdmsListenerManager,
 *   windowsStartupService?: import('../../services/startup/WindowsStartupService').WindowsStartupService,
 *   logger?: import('../../services/logger/LoggerService').LoggerService,
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
        connectionMode: body.connectionMode,
        admsPort: body.admsPort,
        httpPort: body.httpPort,
        typingDelay: body.typingDelay,
        duplicateSeconds: body.duplicateSeconds,
        pressEnter: body.pressEnter,
        autoStart: body.autoStart,
        logging: body.logging,
      };

      if (typeof body.devicePassword === 'string' && body.devicePassword.trim()) {
        patch.devicePassword = body.devicePassword.trim();
      }

      const previous = await deps.configService.load();
      const saved = await deps.configService.save(patch);
      const publicConfig = await deps.configService.getPublic();

      if (deps.logger && previous.logging !== saved.logging) {
        deps.logger.setEnabled(saved.logging);
        await deps.logger.info('Configuration changes', {
          logging: saved.logging,
        });
      } else if (deps.logger) {
        await deps.logger.info('Configuration saved', {
          connectionMode: saved.connectionMode,
          deviceIp: saved.deviceIp,
          admsPort: saved.admsPort,
        });
      }

      const deviceChanged =
        previous.deviceIp !== saved.deviceIp ||
        previous.devicePort !== saved.devicePort ||
        previous.devicePassword !== saved.devicePassword ||
        previous.connectionMode !== saved.connectionMode;

      const admsChanged =
        previous.connectionMode !== saved.connectionMode || previous.admsPort !== saved.admsPort;

      if (deviceChanged && deps.zktecoService) {
        await deps.zktecoService.restart();
      }

      let admsSynced = false;
      if (admsChanged && deps.admsListenerManager) {
        await deps.admsListenerManager.sync(saved);
        admsSynced = true;
      }

      let startupSynced = false;
      if (previous.autoStart !== saved.autoStart && deps.windowsStartupService) {
        await deps.windowsStartupService.syncFromConfig(saved.autoStart);
        startupSynced = true;
      }

      let message = 'Configuration saved.';
      if (previous.httpPort !== saved.httpPort) {
        message = 'Configuration saved. Restart PunchType to apply the new HTTP port.';
      } else if (admsSynced && deviceChanged) {
        message = 'Configuration saved. ADMS listener and device service updated.';
      } else if (admsSynced) {
        message = 'Configuration saved. ADMS push listener updated.';
      } else if (deviceChanged && startupSynced) {
        message = 'Configuration saved. Device service restarted and Windows startup updated.';
      } else if (deviceChanged) {
        message = 'Configuration saved. Device service restarted.';
      } else if (startupSynced) {
        message = saved.autoStart
          ? 'Configuration saved. PunchType will start with Windows.'
          : 'Configuration saved. PunchType removed from Windows startup.';
      }

      res.json({
        ok: true,
        data: {
          config: publicConfig,
          httpPortChanged: previous.httpPort !== saved.httpPort,
          deviceRestarted: deviceChanged,
          admsSynced,
          startupSynced,
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
