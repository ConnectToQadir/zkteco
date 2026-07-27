'use strict';

const { AdmsPushService } = require('../src/services/adms/AdmsPushService');

const punches = [];
const adms = new AdmsPushService({
  configService: { load: async () => ({}) },
  logger: { info: async () => {}, error: async () => {} },
});
adms.on('punch', (p) => punches.push(p));

const future = new Date(Date.now() + 12 * 3600 * 1000);

async function main() {
  const liveOk = await adms._emitRecord(
    { userId: '5', recordedAt: future },
    '192.168.98.95',
    'adms-attlog',
    { isLiveBatch: true, batchSize: 1 },
  );
  console.log('live punch accepted:', liveOk, punches.length);

  const bulkOk = await adms._emitRecord(
    { userId: '5', recordedAt: new Date(Date.now() - 3600000) },
    '192.168.98.95',
    'adms-attlog',
    { isLiveBatch: false, batchSize: 50 },
  );
  console.log('bulk old accepted (should be false):', bulkOk);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
