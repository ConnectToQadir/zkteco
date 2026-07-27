'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   logger?: import('../../services/logger/LoggerService').LoggerService,
 * }} deps
 */
function createStubRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.get('/logs', gate, async (req, res, next) => {
    try {
      let lines = [];
      if (deps.logger) {
        if (typeof deps.logger.readTodayLines === 'function') {
          lines = await deps.logger.readTodayLines(200);
        }
        if (!lines.length) {
          lines = deps.logger.getLines();
        }

        const startupErrors =
          typeof deps.logger.readStartupErrorLines === 'function'
            ? await deps.logger.readStartupErrorLines(30)
            : [];
        if (startupErrors.length) {
          lines = [
            '--- startup-error.log ---',
            ...startupErrors,
            '--- application log ---',
            ...lines,
          ];
        }
      }

      if (!lines.length) {
        lines = ['No log entries yet.'];
      }

      res.json({
        ok: true,
        data: {
          lines,
          logsDir: deps.logger && deps.logger.getLogsDirPath ? deps.logger.getLogsDirPath() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createStubRouter,
};
