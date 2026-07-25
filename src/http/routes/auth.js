'use strict';

const express = require('express');
const { AppError } = require('../../utils/errors');
const { requireUnlock } = require('../middleware/requireUnlock');

/**
 * @param {{
 *   configService: import('../../services/config/ConfigService').ConfigService,
 *   authSessions: import('../../services/auth/AuthSessionService').AuthSessionService,
 * }} deps
 */
function createAuthRouter(deps) {
  const router = express.Router();

  router.post('/auth/setup-pin', async (req, res, next) => {
    try {
      const pin = req.body && req.body.pin;
      await deps.configService.setupPin(pin);
      const token = deps.authSessions.createSession();
      res.json({
        ok: true,
        data: {
          token,
          message: 'PIN created successfully.',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/unlock', async (req, res, next) => {
    try {
      const pin = req.body && req.body.pin;
      const configured = await deps.configService.isPinConfigured();
      if (!configured) {
        throw new AppError('PIN is not configured yet. Set up a PIN first.', 400, 'PIN_NOT_SET');
      }
      const valid = await deps.configService.verifyPin(pin);
      if (!valid) {
        throw new AppError('Incorrect PIN.', 401, 'PIN_INVALID');
      }
      const token = deps.authSessions.createSession();
      res.json({
        ok: true,
        data: { token },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/change-pin', requireUnlock(deps), async (req, res, next) => {
    try {
      const currentPin = req.body && req.body.currentPin;
      const newPin = req.body && req.body.newPin;
      await deps.configService.changePin(currentPin, newPin);
      res.json({
        ok: true,
        data: { message: 'PIN changed successfully.' },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/lock', (req, res) => {
    const header = req.get('x-punchtype-token') || '';
    deps.authSessions.revoke(header);
    res.json({ ok: true, data: { message: 'Locked.' } });
  });

  return router;
}

module.exports = {
  createAuthRouter,
};
