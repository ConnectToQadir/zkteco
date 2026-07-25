'use strict';

/**
 * Reject any request not arriving via loopback.
 * Express must bind to 127.0.0.1; this is defense in depth.
 */
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress || '';
  const normalized = ip.replace('::ffff:', '');
  const allowed = normalized === '127.0.0.1' || normalized === '::1' || ip === '::1';

  if (!allowed) {
    res.status(403).json({
      ok: false,
      error: {
        code: 'LOCAL_ONLY',
        message: 'PunchType settings are only available on this computer.',
      },
    });
    return;
  }

  next();
}

module.exports = {
  localOnly,
};
