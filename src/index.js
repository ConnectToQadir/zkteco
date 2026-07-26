'use strict';

const fs = require('fs');
const path = require('path');

function getInstallRoot() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

function writeStartupError(error) {
  try {
    const root = getInstallRoot();
    const logsDir = path.join(root, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const file = path.join(logsDir, 'startup-error.log');
    const text = [
      new Date().toISOString(),
      String(error && error.stack ? error.stack : error),
      '',
    ].join('\n');
    fs.appendFileSync(file, `${text}\n`, 'utf8');
  } catch (_error) {
    // ignore secondary failures
  }
}

process.on('uncaughtException', (error) => {
  writeStartupError(error);
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  writeStartupError(reason);
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection:', reason);
});

const { startApp } = require('./app');
const { isBackgroundRequested } = require('./utils/windowsBackground');

/** Keep process-level references so the HTTP server is never GC'd. */
let runtime = null;

async function main() {
  try {
    runtime = await startApp();
    if (!isBackgroundRequested()) {
      // eslint-disable-next-line no-console
      console.log(
        `${runtime.productName} v${runtime.version} settings server listening on http://127.0.0.1:${runtime.httpPort}`,
      );
      // eslint-disable-next-line no-console
      console.log('Keep this window open while using PunchType.');
    }
  } catch (error) {
    writeStartupError(error);
    // eslint-disable-next-line no-console
    console.error('Failed to start PunchType:', error);
    process.exitCode = 1;
  }
}

main();
