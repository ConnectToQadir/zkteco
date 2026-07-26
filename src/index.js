'use strict';

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
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start PunchType:', error);
    process.exitCode = 1;
  }
}

main();
