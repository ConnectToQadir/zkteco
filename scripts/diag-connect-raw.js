'use strict';

const net = require('net');
const { createTCPHeader, removeTcpHeader } = require('zkteco-js/src/helper/utils');
const { COMMANDS } = require('zkteco-js/src/helper/command');
const { ConfigService } = require('../src/services/config/ConfigService');

async function main() {
  const config = await new ConfigService().load();
  const { deviceIp: ip, devicePort: port } = config;

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);

    socket.once('connect', async () => {
      const buf = createTCPHeader(COMMANDS.CMD_CONNECT, 0, 0, '');
      socket.once('data', (data) => {
        console.log('Raw response length:', data.length);
        console.log('Raw hex:', data.toString('hex'));

        const inner = removeTcpHeader(data);
        console.log('After removeTcpHeader length:', inner.length);
        console.log('Inner hex:', inner.toString('hex'));

        if (inner.length >= 8) {
          console.log('u16[0]:', inner.readUInt16LE(0));
          console.log('u16[2]:', inner.readUInt16LE(2));
          console.log('u16[4]:', inner.readUInt16LE(4));
          console.log('u16[6]:', inner.readUInt16LE(6));
        }

        socket.end();
        resolve();
      });

      socket.write(buf);
    });

    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('timeout')));
    socket.connect(port, ip);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
