'use strict';

const express = require('express');
const { createAdmsRouter } = require('./routes/adms');

/**
 * Express app for ZKTeco ADMS / iclock PUSH endpoints (LAN-facing).
 * @param {{ admsPushService: import('../services/adms/AdmsPushService').AdmsPushService }} deps
 */
function createAdmsServer(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.text({ type: '*/*', limit: '4mb' }));
  app.use(createAdmsRouter(deps));
  return app;
}

/**
 * @param {import('express').Express} app
 * @param {number} port
 * @returns {Promise<import('http').Server>}
 */
function listenLan(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => resolve(server));
    server.on('error', reject);
  });
}

module.exports = {
  createAdmsServer,
  listenLan,
};
