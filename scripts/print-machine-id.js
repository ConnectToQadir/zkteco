'use strict';

/**
 * Print this Mac's Machine ID (for issuing a local license.dat).
 */
async function main() {
  const { HardwareFingerprint } = require('../src/services/license/HardwareFingerprint');
  const fp = new HardwareFingerprint();
  const id = await fp.getMachineId();
  // eslint-disable-next-line no-console
  console.log(id);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
