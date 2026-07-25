'use strict';

const express = require('express');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * Remaining stub endpoints until later phases.
 * @param {{
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 *   logger?: { getLines: () => string[] },
 * }} deps
 */
function createStubRouter(deps) {
  const router = express.Router();
  const gate = requireUnlock(deps);

  router.get('/license', async (req, res) => {
    res.json({
      ok: true,
      data: {
        machineId: 'Not available until Phase 7',
        customerName: null,
        status: 'unknown',
        note: 'License service arrives in Phase 7',
      },
    });
  });

  router.get('/logs', gate, async (req, res) => {
    const lines = deps.logger && typeof deps.logger.getLines === 'function'
      ? deps.logger.getLines()
      : ['No logger available.'];

    res.json({
      ok: true,
      data: {
        lines: lines.length ? lines : ['No log entries yet.'],
      },
    });
  });

  return router;
}

module.exports = {
  createStubRouter,
};
