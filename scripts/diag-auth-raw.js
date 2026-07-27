'use strict';

const net = require('net');
const { createTCPHeader, removeTcpHeader } = require('zkteco-js/src/helper/utils');
const { COMMANDS } = require('zkteco-js/src/helper/command');
const { makeCommKey } = require('../src/services/zkteco/zkDeviceAuth');
const { ConfigService } = require('../src/services/config/ConfigService');

function writeAndRead(socket, command, sessionId, replyId, data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 10000);
    socket.once('data', (raw) => {
      clearTimeout(timer);
      resolve(raw);
    });
    const buf = createTCPHeader(command, sessionId, replyId, data || '');
    socket.write(buf);
  });
}

async function main() {
  const config = await new ConfigService().load();
  const { deviceIp: ip, devicePort: port, devicePassword: password } = config;

  const socket = new net.Socket();
  socket.setTimeout(10000);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
    socket.connect(port, ip);
  });

  const connectRaw = await writeAndRead(socket, COMMANDS.CMD_CONNECT, 0, 0, '');
  const connectInner = removeTcpHeader(connectRaw);
  const connectCode = connectInner.readUInt16LE(0);
  const sessionId = connectInner.readUInt16LE(4);
  console.log('Connect code:', connectCode, connectCode === 6001 ? '(new firmware UNAUTH)' : '');
  console.log('Session ID:', sessionId);

  const authPayload = makeCommKey(Number(password), sessionId);
  console.log('Sending CMD_AUTH with payload:', authPayload.toString('hex'), 'password:', password);

  const authRaw = await writeAndRead(socket, COMMANDS.CMD_AUTH, sessionId, 1, authPayload);
  const authInner = removeTcpHeader(authRaw);
  console.log('Auth raw hex:', authRaw.toString('hex'));
  console.log('Auth inner hex:', authInner.toString('hex'));
  if (authInner.length >= 2) {
    console.log('Auth response code:', authInner.readUInt16LE(0));
  }

  socket.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
