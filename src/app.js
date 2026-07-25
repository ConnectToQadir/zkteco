'use strict';

const { ConfigService } = require('./services/config/ConfigService');
const { AuthSessionService } = require('./services/auth/AuthSessionService');
const { ZktecoService } = require('./services/zkteco/ZktecoService');
const { MemoryLogger } = require('./services/logger/MemoryLogger');
const { createHttpServer, listenLoopback } = require('./http/server');

const PRODUCT_NAME = 'PunchType';
const VERSION = '1.0.0';

/**
 * Composition root.
 */
async function createApp() {
  const startedAt = Date.now();
  const configService = new ConfigService();
  const authSessions = new AuthSessionService();
  const logger = new MemoryLogger();
  const zktecoService = new ZktecoService({ configService, logger });

  const config = await configService.load();
  const app = createHttpServer({
    configService,
    authSessions,
    zktecoService,
    logger,
    productName: PRODUCT_NAME,
    version: VERSION,
    startedAt,
  });

  return {
    app,
    configService,
    authSessions,
    zktecoService,
    logger,
    httpPort: config.httpPort,
    productName: PRODUCT_NAME,
    version: VERSION,
  };
}

/**
 * @returns {Promise<{
 *   server: import('http').Server,
 *   httpPort: number,
 *   productName: string,
 *   zktecoService: import('./services/zkteco/ZktecoService').ZktecoService,
 * }>}
 */
async function startApp() {
  const context = await createApp();
  const server = await listenLoopback(context.app, context.httpPort);

  // Start device loop in background; never crash the HTTP server if device is offline.
  context.zktecoService.start().catch(async (error) => {
    await context.logger.error('Device service failed to start', { error: error.message });
  });

  await context.logger.info('Application started', {
    httpPort: context.httpPort,
    version: context.version,
  });

  return {
    server,
    httpPort: context.httpPort,
    productName: context.productName,
    version: context.version,
    zktecoService: context.zktecoService,
  };
}

module.exports = {
  createApp,
  startApp,
  PRODUCT_NAME,
  VERSION,
};
