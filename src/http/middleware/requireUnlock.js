'use strict';

/**
 * @param {{ authSessions: import('../../services/auth/AuthSessionService').AuthSessionService }} deps
 */
function requireUnlock(deps) {
  return function requireUnlockMiddleware(req, res, next) {
    try {
      const header = req.get('x-punchtype-token') || '';
      deps.authSessions.assertValid(header);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requireUnlock,
};
