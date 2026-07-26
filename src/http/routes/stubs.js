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
      let lines = ['No log entries yet.'];
      if (deps.logger) {
        if (typeof deps.logger.readTodayLines === 'function') {
          const fromDisk = await deps.logger.readTodayLines(200);
          lines = fromDisk.length ? fromDisk : deps.logger.getLines();
        } else {
          lines = deps.logger.getLines();
        }
        if (!lines.length) {
          lines = ['No log entries yet.'];
        }
      }

      res.json({
        ok: true,
        data: { lines },
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
