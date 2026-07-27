'use strict';

const { ConfigService } = require('./services/config/ConfigService');
const { AuthSessionService } = require('./services/auth/AuthSessionService');
const { ZktecoService } = require('./services/zkteco/ZktecoService');
const { LoggerService } = require('./services/logger/LoggerService');
const { createKeyboardTyper } = require('./services/keyboard/createKeyboardTyper');
const { KeyboardTypingService } = require('./services/keyboard/KeyboardTypingService');
const { DuplicatePunchFilter } = require('./services/keyboard/DuplicatePunchFilter');
const { LicenseService } = require('./services/license/LicenseService');
const { LicenseTypingGate } = require('./services/license/LicenseTypingGate');
const { AttendanceOrchestrator } = require('./services/orchestrator/AttendanceOrchestrator');
const { WindowsStartupService } = require('./services/startup/WindowsStartupService');
const { createHttpServer, listenLoopback } = require('./http/server');
const { AdmsPushService } = require('./services/adms/AdmsPushService');
const { AdmsListenerManager } = require('./services/adms/AdmsListenerManager');
const {
  applyBackgroundMode,
  isBackgroundRequested,
} = require('./utils/windowsBackground');
const { ensureDataDirs } = require('./utils/paths');

const PRODUCT_NAME = 'PunchType';
const VERSION = '1.0.0';

/**
 * Composition root.
 */
async function createApp() {
  const startedAt = Date.now();
  ensureDataDirs();
  const background = applyBackgroundMode();

  const configService = new ConfigService();
  const initialConfig = await configService.load();

  if (process.env.PUNCHTYPE_HTTP_PORT) {
    const overridePort = Number(process.env.PUNCHTYPE_HTTP_PORT);
    if (Number.isInteger(overridePort) && overridePort > 0 && overridePort <= 65535) {
      initialConfig.httpPort = overridePort;
    }
  }

  if (process.env.PUNCHTYPE_MOCK_DEVICE === '1' || process.env.PUNCHTYPE_MOCK_DEVICE === 'true') {
    if (!initialConfig.deviceIp) {
      initialConfig.deviceIp = 'mock';
    }
  }

  const logger = new LoggerService({
    enabled: initialConfig.logging,
    mirrorToConsole: !isBackgroundRequested(),
  });

  if (background.active) {
    await logger.info('Background mode active', { reason: background.reason });
  }

  const authSessions = new AuthSessionService();
  const licenseService = new LicenseService({
    logger,
    productVersion: VERSION,
  });
  const licenseGate = new LicenseTypingGate({ licenseService });
  const zktecoService = new ZktecoService({ configService, logger });
  const admsPushService = new AdmsPushService({ configService, logger });
  admsPushService.on('punch', (punch) => zktecoService.receivePushPunch(punch));
  const admsListenerManager = new AdmsListenerManager({ admsPushService, logger });
  const keyboardTypingService = new KeyboardTypingService({
    typer: createKeyboardTyper(),
    logger,
  });
  const duplicateFilter = new DuplicatePunchFilter();
  const attendanceOrchestrator = new AttendanceOrchestrator({
    configService,
    zktecoService,
    keyboardTypingService,
    duplicateFilter,
    licenseGate,
    logger,
  });
  const windowsStartupService = new WindowsStartupService({ logger });

  const app = createHttpServer({
    configService,
    authSessions,
    zktecoService,
    admsPushService,
    admsListenerManager,
    attendanceOrchestrator,
    windowsStartupService,
    licenseService,
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
    admsPushService,
    admsListenerManager,
    attendanceOrchestrator,
    windowsStartupService,
    licenseService,
    logger,
    httpPort: initialConfig.httpPort,
    admsPort: initialConfig.admsPort,
    connectionMode: initialConfig.connectionMode,
    productName: PRODUCT_NAME,
    version: VERSION,
  };
}

/**
 * @returns {Promise<object>}
 */
async function startApp() {
  const context = await createApp();
  const server = await listenLoopback(context.app, context.httpPort);

  const startupConfig = await context.configService.load();
  try {
    await context.admsListenerManager.sync(startupConfig);
  } catch (_error) {
    // Logged inside manager; app can still run pull mode.
  }

  context.attendanceOrchestrator.start();
  try {
    await context.windowsStartupService.syncFromConfig(startupConfig.autoStart);
  } catch (error) {
    await context.logger.error('Failed to sync Windows startup', {
      error: error.message,
    });
  }

  try {
    const license = await context.licenseService.getInfo({ force: true });
    await context.logger.info('License validation', {
      status: license.status,
      machineId: license.machineId,
    });
  } catch (error) {
    await context.logger.error('License validation failed at startup', {
      error: error.message,
    });
  }

  context.zktecoService.start().catch(async (error) => {
    await context.logger.error('Device service failed to start', { error: error.message });
  });

  const shutdown = async (signal) => {
    await context.logger.info('Application closed', { signal });
    try {
      await context.zktecoService.stop();
    } catch (_error) {
      // ignore
    }
    try {
      await context.admsListenerManager.stop();
    } catch (_error) {
      // ignore
    }
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const admsEnabled =
    startupConfig.connectionMode === 'push' || startupConfig.connectionMode === 'both';
  await context.logger.info('Application started', {
    httpPort: context.httpPort,
    admsPort: admsEnabled ? startupConfig.admsPort : null,
    connectionMode: startupConfig.connectionMode,
    version: context.version,
    typingMode: context.attendanceOrchestrator.getStatus().typing.mode,
    autoStart: startupConfig.autoStart,
    logging: startupConfig.logging,
  });

  return {
    server,
    httpPort: context.httpPort,
    productName: context.productName,
    version: context.version,
    zktecoService: context.zktecoService,
    attendanceOrchestrator: context.attendanceOrchestrator,
    windowsStartupService: context.windowsStartupService,
    licenseService: context.licenseService,
    logger: context.logger,
  };
}

module.exports = {
  createApp,
  startApp,
  PRODUCT_NAME,
  VERSION,
};
