'use strict';

/**
 * End-to-end smoke test on macOS (no Windows EXE, no ZK hardware).
 *
 * Usage:
 *   npm run mac:smoke
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PUNCHTYPE_SMOKE_PORT || 47826);
const PIN = '1234';
const DATA_DIR = path.join(ROOT, '.mac-smoke-data');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { 'x-punchtype-token': options.token } : {}),
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/api${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const msg = (json && json.error && json.error.message) || `HTTP ${res.status}`;
    throw new Error(`${pathname}: ${msg}`);
  }
  return json.data;
}

async function issueLicense(machineId) {
  const out = path.join(ROOT, 'license', 'mac-dev-license.dat');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(ROOT, 'tools/license-generator/issue.js'),
        '--customer',
        'Mac Dev',
        '--machine',
        machineId,
        '--out',
        out,
      ],
      { cwd: ROOT, stdio: 'inherit' },
    );
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`license issue exit ${code}`)),
    );
  });

  return fs.readFileSync(out, 'utf8');
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  let lastError = '';
  while (Date.now() - start < timeoutMs) {
    try {
      await api('/status');
      return;
    } catch (error) {
      lastError = error.message;
      await sleep(300);
    }
  }
  throw new Error(`Server did not become ready: ${lastError}`);
}

async function main() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const child = spawn(process.execPath, [path.join(ROOT, 'src/index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PUNCHTYPE_MOCK_DEVICE: '1',
      PUNCHTYPE_HTTP_PORT: String(PORT),
      PUNCHTYPE_DATA_DIR: DATA_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout.on('data', (chunk) => {
    bootLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    bootLog += chunk.toString();
  });

  try {
    await waitForServer();

    const status = await api('/status');
    const machineId = status.license && status.license.machineId;
    if (!machineId) {
      throw new Error('Machine ID missing from /status');
    }

    let token;
    if (!status.pinConfigured) {
      const setup = await api('/auth/setup-pin', {
        method: 'POST',
        body: { pin: PIN },
      });
      token = setup.token;
    } else {
      try {
        const unlock = await api('/auth/unlock', {
          method: 'POST',
          body: { pin: PIN },
        });
        token = unlock.token;
      } catch (_error) {
        // Isolated smoke data should use PIN 1234; if an old folder leaked, recreate.
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
        fs.mkdirSync(DATA_DIR, { recursive: true });
        throw new Error(
          `Unlock failed for smoke PIN ${PIN}. Cleared ${DATA_DIR} — re-run npm run mac:smoke.`,
        );
      }
    }

    await api('/config', {
      method: 'POST',
      token,
      body: {
        deviceIp: 'mock',
        devicePort: 4370,
        httpPort: PORT,
        typingDelay: 20,
        duplicateSeconds: 0,
        pressEnter: true,
        autoStart: false,
        logging: true,
      },
    });

    const licenseContent = await issueLicense(machineId);
    const lic = await api('/license/upload', {
      method: 'POST',
      token,
      body: { content: licenseContent },
    });
    if (!lic.valid) {
      throw new Error(`License not valid: ${lic.message}`);
    }

    await api('/restart', { method: 'POST', token, body: {} });
    await sleep(1500);

    const deviceStatus = await api('/status');
    if (!deviceStatus.device || !deviceStatus.device.connected) {
      throw new Error(
        `Mock device not connected: ${JSON.stringify(deviceStatus.device)}`,
      );
    }

    const sim = await api('/simulate-punch', {
      method: 'POST',
      token,
      body: { employeeId: '105' },
    });

    await sleep(500);

    const logs = await api('/logs', { token });
    const text = (logs.lines || []).join('\n');
    const hasAttendance = /Attendance received/i.test(text);
    const hasTyped = /Employee typed/i.test(text);

    // eslint-disable-next-line no-console
    console.log('--- mac smoke results ---');
    // eslint-disable-next-line no-console
    console.log('device:', deviceStatus.device.adapter, deviceStatus.device.mode);
    // eslint-disable-next-line no-console
    console.log('simulate:', sim.message);
    // eslint-disable-next-line no-console
    console.log('typing mode:', sim.typing && sim.typing.mode);
    // eslint-disable-next-line no-console
    console.log('Attendance received:', hasAttendance);
    // eslint-disable-next-line no-console
    console.log('Employee typed:', hasTyped);

    if (!hasAttendance || !hasTyped) {
      // eslint-disable-next-line no-console
      console.error('Boot log:\n', bootLog);
      // eslint-disable-next-line no-console
      console.error('Recent logs:\n', text.split('\n').slice(0, 40).join('\n'));
      throw new Error('Expected Attendance received + Employee typed in logs');
    }

    // eslint-disable-next-line no-console
    console.log(
      'OK — Mac pipeline works (stub typing). Rebuild Windows EXE only when ready to test SendInput + real ZK.',
    );
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    try {
      child.kill('SIGKILL');
    } catch (_error) {
      // ignore
    }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('mac-smoke failed:', error.message);
  process.exit(1);
});
