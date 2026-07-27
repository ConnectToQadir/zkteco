'use strict';

const express = require('express');
const { getPublicDir } = require('../utils/paths');
const { localOnly } = require('./middleware/localOnly');
const { createErrorHandler } = require('./middleware/errorHandler');
const { createStatusRouter } = require('./routes/status');
const { createAuthRouter } = require('./routes/auth');
const { createConfigRouter } = require('./routes/config');
const { createDeviceRouter } = require('./routes/device');
const { createLicenseRouter } = require('./routes/license');
const { createStubRouter } = require('./routes/stubs');

/**
 * @param {object} deps
 */
function createHttpServer(deps) {
  const app = express();

  app.disable('x-powered-by');
  app.use(localOnly);
  app.use(express.json({ limit: '128kb' }));

  app.use(express.static(getPublicDir()));

  const api = express.Router();
  api.use(createStatusRouter(deps));
  api.use(createAuthRouter(deps));
  api.use(createConfigRouter(deps));
  api.use(createDeviceRouter(deps));
  api.use(createLicenseRouter(deps));
  api.use(createStubRouter(deps));
  app.use('/api', api);

  app.use(createErrorHandler(deps));

  return app;
}

/**
 * @param {import('express').Express} app
 * @param {number} port
 * @returns {Promise<import('http').Server>}
 */
function listenLoopback(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

module.exports = {
  createHttpServer,
  listenLoopback,
};
