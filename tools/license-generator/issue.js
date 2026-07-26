'use strict';

/**
 * Offline license issuer — PRIVATE KEY never ships to customers.
 *
 * Usage:
 *   node tools/license-generator/issue.js --customer "Acme Corp" --machine <sha256> [--out license.dat]
 */

const fs = require('fs');
const path = require('path');
const { RsaVerifier } = require('../../src/services/license/RsaVerifier');

function parseArgs(argv) {
  const out = {
    customer: '',
    machine: '',
    version: '1.0.0',
    out: path.resolve(__dirname, '../../license/license.dat'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--customer') out.customer = argv[++i] || '';
    else if (arg === '--machine') out.machine = argv[++i] || '';
    else if (arg === '--version') out.version = argv[++i] || out.version;
    else if (arg === '--out') out.out = path.resolve(argv[++i] || out.out);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.customer || !args.machine) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: node tools/license-generator/issue.js --customer "Name" --machine <fingerprint> [--version 1.0.0] [--out license.dat]',
    );
    process.exitCode = 1;
    return;
  }

  if (!/^[a-f0-9]{64}$/i.test(args.machine)) {
    // eslint-disable-next-line no-console
    console.error('Machine fingerprint must be a 64-char SHA-256 hex string.');
    process.exitCode = 1;
    return;
  }

  const privateKeyPath = path.join(__dirname, 'keys', 'private.pem');
  if (!fs.existsSync(privateKeyPath)) {
    // eslint-disable-next-line no-console
    console.error('Missing private key at tools/license-generator/keys/private.pem');
    process.exitCode = 1;
    return;
  }

  const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  const payload = {
    customerName: args.customer,
    machineFingerprint: args.machine.toLowerCase(),
    productVersion: args.version,
    featureFlags: {
      multiDevice: false,
      maxDevices: 1,
    },
    issuedAt: new Date().toISOString(),
  };

  const signature = RsaVerifier.sign(payload, privateKeyPem);
  const license = { payload, signature };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(license, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`License written: ${args.out}`);
  // eslint-disable-next-line no-console
  console.log(`Customer: ${payload.customerName}`);
  // eslint-disable-next-line no-console
  console.log(`Machine:  ${payload.machineFingerprint}`);
}

main();
