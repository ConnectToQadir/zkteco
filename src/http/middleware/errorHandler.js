'use strict';

const { AppError } = require('../../utils/errors');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
  const message =
    err instanceof AppError ? err.message : 'An unexpected error occurred.';

  if (!(err instanceof AppError)) {
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
}

module.exports = {
  errorHandler,
};
