'use strict';

const { AppError } = require('../../utils/errors');

/**
 * @param {{ logger?: { error: Function } }} [deps]
 */
function createErrorHandler(deps = {}) {
  const logger = deps.logger;

  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }

    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
    const message =
      err instanceof AppError ? err.message : 'An unexpected error occurred.';

    if (logger) {
      void logger.error('HTTP request failed', {
        code,
        message: err instanceof AppError ? err.message : String(err && err.message || err),
        path: req.path,
        statusCode,
      });
    } else if (!(err instanceof AppError)) {
      // eslint-disable-next-line no-console
      console.error('[PunchType] Unhandled error:', err);
    }

    res.status(statusCode).json({
      ok: false,
      error: {
        code,
        message,
      },
    });
  };
}

module.exports = {
  createErrorHandler,
};
