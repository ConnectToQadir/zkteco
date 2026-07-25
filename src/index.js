'use strict';

const { startApp } = require('./app');

async function main() {
  try {
    const { httpPort, productName, version } = await startApp();
    // eslint-disable-next-line no-console
    console.log(`${productName} v${version} settings server listening on http://127.0.0.1:${httpPort}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start PunchType:', error);
    process.exitCode = 1;
  }
}

main();
