'use strict';

const Zkteco = require('zkteco-js');
const {
  installZktecoTransportCapture,
  authenticateZktecoJsClient,
  makeCommKey,
} = require('../src/services/zkteco/zkDeviceAuth');
const { ConfigService } = require('../src/services/config/ConfigService');

async function main() {
  const config = await new ConfigService().load();
  const ip = config.deviceIp;
  const port = config.devicePort;
  const password = config.devicePassword;

  console.log('Device:', `${ip}:${port}`);
  console.log('Password configured:', password ? `"${password}" (${password.length} chars)` : '(empty)');

  const client = new Zkteco(ip, port, 15000, 5200, 8184);
  installZktecoTransportCapture(client);

  await client.createSocket();

  const transport = client.ztcp;
  console.log('Connect code:', transport._lastConnectCode);
  console.log('Session ID:', transport.sessionId);

  if (password && transport.sessionId != null) {
    const payload = makeCommKey(Number(password), transport.sessionId);
    console.log('Auth payload hex:', payload.toString('hex'));
  }

  try {
    const authed = await authenticateZktecoJsClient(client, password);
    console.log('Auth result:', authed);
  } catch (error) {
    console.error('Auth failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  }

  try {
    await client.disconnect();
  } catch (_error) {
    // ignore
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
