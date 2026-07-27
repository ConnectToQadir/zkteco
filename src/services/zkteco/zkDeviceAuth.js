'use strict';

const { AppError } = require('../../utils/errors');

const CMD_CONNECT = 1000;
const CMD_ACK_OK = 2000;
const CMD_ACK_UNAUTH = 2005;
const CMD_AUTH = 1102;
/** Newer ZK firmware uses 6001 instead of 2005 when a comm key is enabled. */
const CMD_ACK_UNAUTH_NEW = 6001;
/** Returned when legacy CMD_AUTH is no longer accepted (push-era firmware). */
const CMD_ACK_AUTH_LEGACY_UNSUPPORTED = 2032;
/** Human-readable hint when pull SDK auth is retired on newer firmware (e.g. SenseFace 2A). */
const LEGACY_PULL_UNSUPPORTED_MESSAGE =
  'This device firmware uses the newer standalone security handshake (connect code 6001) and no longer accepts legacy TCP pull authentication (CMD_AUTH), even with the correct Comm Key. PunchType uses the pull SDK (zkteco-js / node-zklib), which cannot authenticate SenseFace 2A and similar models on recent firmware. Workarounds: use a ZKTeco terminal that still supports standalone pull SDK, ask your vendor about compatible firmware, or wait for PunchType ADMS push support. Comm Key 999999 on the device is not the problem — the device replied 2032 (legacy auth retired).';
const COMM_KEY_XOR = ['Z', 'K', 'S', 'O'];
const COMM_KEY_TICKS = 50;

/**
 * @param {number | null | undefined} connectCode
 * @returns {boolean}
 */
function isUnauthenticatedConnectCode(connectCode) {
  return connectCode === CMD_ACK_UNAUTH || connectCode === CMD_ACK_UNAUTH_NEW;
}

/**
 * Parse ZK standalone communication password (numeric comm key).
 * @param {string | number | undefined | null} password
 * @returns {number | null}
 */
function parseDeviceCommKey(password) {
  if (password == null) {
    return null;
  }
  const raw = String(password).trim();
  if (!raw) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    throw new AppError(
      'Device communication password must be numeric (comm key).',
      400,
      'INVALID_DEVICE_PASSWORD',
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(
      'Device communication password is out of range.',
      400,
      'INVALID_DEVICE_PASSWORD',
    );
  }
  return value;
}

/**
 * Derive the 4-byte CMD_AUTH payload for a ZK comm key.
 * @param {number} key
 * @param {number} sessionId
 * @param {number} [ticks]
 * @returns {Buffer}
 */
function makeCommKey(key, sessionId, ticks = COMM_KEY_TICKS) {
  let k = 0;
  const commKey = Math.floor(key);
  const session = Math.floor(sessionId);

  for (let i = 0; i < 32; i += 1) {
    if (commKey & (1 << i)) {
      k = (k << 1) | 1;
    } else {
      k <<= 1;
    }
  }

  k += session;

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, k, true);
  let bytes = new Uint8Array(buffer);

  const xorKey = COMM_KEY_XOR.map((char) => char.charCodeAt(0));
  bytes = bytes.map((byte, index) => byte ^ xorKey[index]);

  const swapped = new Uint8Array([bytes[2], bytes[3], bytes[0], bytes[1]]);
  const tickByte = ticks & 0xff;

  return Buffer.from([
    swapped[0] ^ tickByte,
    swapped[1] ^ tickByte,
    tickByte,
    swapped[3] ^ tickByte,
  ]);
}

/**
 * Remember CMD_CONNECT response codes so we only CMD_AUTH when required.
 * Must be installed before createSocket()/connect().
 * @param {{ executeCmd: Function, _punchtypeAuthCapture?: boolean, _lastConnectCode?: number | null }} transport
 */
function installTransportCapture(transport) {
  if (!transport || transport._punchtypeAuthCapture) {
    return;
  }

  transport._punchtypeAuthCapture = true;
  transport._lastConnectCode = null;

  const originalExecuteCmd = transport.executeCmd.bind(transport);
  transport.executeCmd = async (command, data) => {
    const reply = await originalExecuteCmd(command, data);
    if (command === CMD_CONNECT && reply && reply.length >= 2) {
      transport._lastConnectCode = reply.readUInt16LE(0);
    }
    return reply;
  };
}

/**
 * @param {import('zkteco-js')} client
 */
function installZktecoTransportCapture(client) {
  if (client.ztcp) {
    installTransportCapture(client.ztcp);
  }
  if (client.zudp) {
    installTransportCapture(client.zudp);
  }
}

/**
 * @param {import('node-zklib')} client
 */
function installNodeZkLibTransportCapture(client) {
  if (client.zklibTcp) {
    installTransportCapture(client.zklibTcp);
  }
  if (client.zklibUdp) {
    installTransportCapture(client.zklibUdp);
  }
}

/**
 * Send CMD_AUTH when the device replied CMD_ACK_UNAUTH to CMD_CONNECT.
 * @param {{ executeCmd: Function, sessionId: number | null, _lastConnectCode?: number | null }} transport
 * @param {string | number | null | undefined} password
 * @returns {Promise<boolean>} true when CMD_AUTH succeeded
 */
async function authenticateDeviceTransport(transport, password) {
  const commKey = parseDeviceCommKey(password);
  const connectCode = transport._lastConnectCode;

  if (connectCode === CMD_ACK_OK) {
    return false;
  }

  if (isUnauthenticatedConnectCode(connectCode)) {
    if (commKey === null) {
      const zeroAuthOk = await tryCommKeyAuth(transport, 0);
      if (zeroAuthOk) {
        return true;
      }
      throw new AppError(
        'Device requires a communication password. Enter the numeric Comm Key from the device menu (Comm → PC Connection). If Comm Key is disabled (0), enter 0, click Save Configuration, then restart the service.',
        400,
        'DEVICE_PASSWORD_REQUIRED',
      );
    }
  } else if (commKey === null) {
    return false;
  } else if (connectCode != null) {
    throw new AppError(
      `Device returned an unexpected connect response (${connectCode}). If Comm Key is enabled on the device, confirm it matches settings; otherwise set Comm Key to 0 on the device and restart PunchType.`,
      400,
      'DEVICE_CONNECT_UNEXPECTED',
    );
  }

  if (transport.sessionId == null) {
    throw new AppError(
      'Device session is not ready for authentication.',
      500,
      'DEVICE_AUTH_SESSION_MISSING',
    );
  }

  const authOk = await tryCommKeyAuth(transport, commKey);
  if (!authOk) {
    if (commKey !== 0) {
      const zeroAuthOk = await tryCommKeyAuth(transport, 0);
      if (zeroAuthOk) {
        throw new AppError(
          'Device Comm Key is disabled (0), but a different communication password is saved in settings. Enter 0 in Device Communication Password, click Save Configuration, then restart the service.',
          400,
          'DEVICE_AUTH_USE_ZERO',
        );
      }
    }

    if (connectCode === CMD_ACK_UNAUTH_NEW) {
      throw new AppError(LEGACY_PULL_UNSUPPORTED_MESSAGE, 400, 'DEVICE_AUTH_LEGACY_UNSUPPORTED');
    }
    throw new AppError(
      'Device rejected the communication password. Confirm the Comm Key on the device matches Device Communication Password in settings. If Comm Key is disabled on the device, enter 0, click Save Configuration, then restart the service.',
      400,
      'DEVICE_AUTH_FAILED',
    );
  }

  return true;
}

/**
 * @param {{ executeCmd: Function, sessionId: number | null }} transport
 * @param {number} commKey
 * @returns {Promise<boolean>}
 */
async function tryCommKeyAuth(transport, commKey) {
  if (transport.sessionId == null) {
    return false;
  }

  const authPayload = makeCommKey(commKey, transport.sessionId);
  const reply = await transport.executeCmd(CMD_AUTH, authPayload);
  const code = reply && reply.length >= 2 ? reply.readUInt16LE(0) : null;
  if (code === CMD_ACK_OK) {
    return true;
  }

  if (code === CMD_ACK_AUTH_LEGACY_UNSUPPORTED) {
    throw new AppError(LEGACY_PULL_UNSUPPORTED_MESSAGE, 400, 'DEVICE_AUTH_LEGACY_UNSUPPORTED');
  }

  return false;
}

/**
 * Authenticate a zkteco-js client after createSocket().
 * @param {import('zkteco-js')} client
 * @param {string | number | null | undefined} password
 */
async function authenticateZktecoJsClient(client, password) {
  if (client.connectionType === 'tcp' && client.ztcp && client.ztcp.socket) {
    return authenticateDeviceTransport(client.ztcp, password);
  }

  if (client.connectionType === 'udp' && client.zudp && client.zudp.socket) {
    return authenticateDeviceTransport(client.zudp, password);
  }

  throw new AppError('Device transport is not connected.', 500, 'DEVICE_NOT_CONNECTED');
}

/**
 * Authenticate a node-zklib client after createSocket().
 * @param {import('node-zklib')} client
 * @param {string | number | null | undefined} password
 */
async function authenticateNodeZkLibClient(client, password) {
  if (client.connectionType === 'tcp' && client.zklibTcp && client.zklibTcp.socket) {
    return authenticateDeviceTransport(client.zklibTcp, password);
  }

  if (client.connectionType === 'udp' && client.zklibUdp && client.zklibUdp.socket) {
    return authenticateDeviceTransport(client.zklibUdp, password);
  }

  throw new AppError('Device transport is not connected.', 500, 'DEVICE_NOT_CONNECTED');
}

module.exports = {
  CMD_ACK_UNAUTH_NEW,
  CMD_ACK_AUTH_LEGACY_UNSUPPORTED,
  isUnauthenticatedConnectCode,
  parseDeviceCommKey,
  makeCommKey,
  installTransportCapture,
  installZktecoTransportCapture,
  installNodeZkLibTransportCapture,
  authenticateDeviceTransport,
  authenticateZktecoJsClient,
  authenticateNodeZkLibClient,
};
