(() => {
  'use strict';

  const TOKEN_KEY = 'punchtype_session_token';

  const gatePanel = document.getElementById('gatePanel');
  const settingsPanel = document.getElementById('settingsPanel');
  const gateForm = document.getElementById('gateForm');
  const gateTitle = document.getElementById('gateTitle');
  const gateHelp = document.getElementById('gateHelp');
  const gateSubmit = document.getElementById('gateSubmit');
  const gateMessage = document.getElementById('gateMessage');
  const pinInput = document.getElementById('pinInput');
  const confirmPinWrap = document.getElementById('confirmPinWrap');
  const confirmPinInput = document.getElementById('confirmPinInput');
  const lockBtn = document.getElementById('lockBtn');
  const statusBadge = document.getElementById('statusBadge');
  const deviceBadge = document.getElementById('deviceBadge');
  const footerStatus = document.getElementById('footerStatus');
  const configForm = document.getElementById('configForm');
  const configMessage = document.getElementById('configMessage');
  const changePinForm = document.getElementById('changePinForm');
  const pinMessage = document.getElementById('pinMessage');
  const logsView = document.getElementById('logsView');

  let pinConfigured = false;
  let unlocked = false;

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function setMessage(el, text, type) {
    el.textContent = text || '';
    el.classList.remove('ok', 'error');
    if (type) {
      el.classList.add(type);
    }
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = getToken();
    if (token) {
      headers['x-punchtype-token'] = token;
    }

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await response.json().catch(() => ({
      ok: false,
      error: { message: 'Invalid server response.' },
    }));

    if (!response.ok || payload.ok === false) {
      const error = new Error((payload.error && payload.error.message) || 'Request failed.');
      error.code = payload.error && payload.error.code;
      error.status = response.status;
      throw error;
    }

    return payload.data;
  }

  function showGate() {
    unlocked = false;
    gatePanel.classList.remove('hidden');
    settingsPanel.classList.add('hidden');
    lockBtn.classList.add('hidden');

    if (pinConfigured) {
      gateTitle.textContent = 'Unlock settings';
      gateHelp.textContent = 'Enter your local PIN to manage PunchType on this computer.';
      gateSubmit.textContent = 'Unlock';
      confirmPinWrap.classList.add('hidden');
      confirmPinInput.required = false;
    } else {
      gateTitle.textContent = 'Create local PIN';
      gateHelp.textContent = 'First run: choose a 4–8 digit PIN to protect settings on this PC.';
      gateSubmit.textContent = 'Create PIN';
      confirmPinWrap.classList.remove('hidden');
      confirmPinInput.required = true;
    }
  }

  function showSettings() {
    unlocked = true;
    gatePanel.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    lockBtn.classList.remove('hidden');
  }

  function fillConfig(config) {
    document.getElementById('deviceIp').value = config.deviceIp || '';
    document.getElementById('devicePort').value = config.devicePort;
    document.getElementById('devicePassword').value = '';
    document.getElementById('devicePassword').placeholder = config.devicePasswordSet
      ? 'Password saved — enter a new value to replace'
      : 'Leave blank if not required';
    document.getElementById('typingDelay').value = config.typingDelay;
    document.getElementById('duplicateSeconds').value = config.duplicateSeconds;
    document.getElementById('pressEnter').checked = Boolean(config.pressEnter);
    document.getElementById('httpPort').value = config.httpPort;
    document.getElementById('autoStart').checked = Boolean(config.autoStart);
    document.getElementById('logging').checked = Boolean(config.logging);
  }

  function applyLicenseToUi(license) {
    const machineId = license.machineId || '—';
    document.getElementById('machineId').textContent = machineId;
    document.getElementById('customerName').textContent = license.customerName || '—';
    document.getElementById('licenseStatus').textContent = license.status || '—';
    const issuedAt = document.getElementById('licenseIssuedAt');
    if (issuedAt) {
      issuedAt.textContent = license.issuedAt || '—';
    }
    const licenseMessage = document.getElementById('licenseMessage');
    if (licenseMessage) {
      licenseMessage.textContent = license.message || '';
    }
    const gateMachineId = document.getElementById('gateMachineId');
    if (gateMachineId) {
      gateMachineId.value = machineId;
    }
    const gateLicenseStatus = document.getElementById('gateLicenseStatus');
    if (gateLicenseStatus) {
      const label = license.valid
        ? `License status: valid (${license.customerName || 'activated'})`
        : `License status: ${license.status || 'missing'} — upload license.dat after payment to activate typing`;
      gateLicenseStatus.textContent = label;
    }
  }

  async function loadLicensePublic() {
    const license = await api('/license?refresh=1');
    applyLicenseToUi(license);
    return license;
  }

  async function copyText(value) {
    if (!value || value === '—' || value === 'Loading…') {
      throw new Error('Machine ID is not ready yet.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const temp = document.createElement('textarea');
    temp.value = value;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
  }

  async function loadStatus() {
    const status = await api('/status');
    pinConfigured = Boolean(status.pinConfigured);
    statusBadge.textContent = `${status.product} v${status.version}`;

    const device = status.device || {};
    if (!device.ip) {
      deviceBadge.textContent = 'Device: not configured';
    } else if (device.connected) {
      deviceBadge.textContent = `Device: connected (${device.mode || 'on'})`;
    } else if (device.running) {
      deviceBadge.textContent = `Device: reconnecting${device.lastError ? '…' : ''}`;
    } else {
      deviceBadge.textContent = 'Device: stopped';
    }

    footerStatus.textContent = `${status.product} · uptime ${status.uptimeSeconds}s · port ${status.httpPort}`;

    const startupHint = document.getElementById('startupHint');
    if (startupHint && status.startup) {
      if (!status.startup.supported) {
        startupHint.textContent =
          'Windows startup is managed on Windows PCs only (no-op on this OS).';
      } else if (status.startup.enabled) {
        startupHint.textContent = 'Windows startup: enabled (HKCU Run → PunchType).';
      } else {
        startupHint.textContent = 'Windows startup: disabled.';
      }
    }

    if (status.license) {
      applyLicenseToUi(status.license);
    } else {
      try {
        await loadLicensePublic();
      } catch (_error) {
        // ignore; gate will show loading state
      }
    }

    return status;
  }

  async function loadProtectedData() {
    const [config, license, logs] = await Promise.all([
      api('/config'),
      api('/license?refresh=1'),
      api('/logs'),
    ]);
    fillConfig(config);
    applyLicenseToUi(license);
    logsView.textContent = (logs.lines || []).join('\n');
  }

  async function tryRestoreSession() {
    const token = getToken();
    if (!token || !pinConfigured) {
      showGate();
      return;
    }
    try {
      await loadProtectedData();
      showSettings();
    } catch (error) {
      clearToken();
      showGate();
    }
  }

  gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(gateMessage, '');
    const pin = pinInput.value.trim();

    try {
      if (!pinConfigured) {
        const confirmPin = confirmPinInput.value.trim();
        if (pin !== confirmPin) {
          throw new Error('PIN confirmation does not match.');
        }
        const data = await api('/auth/setup-pin', { method: 'POST', body: { pin } });
        setToken(data.token);
        pinConfigured = true;
        setMessage(gateMessage, 'PIN created.', 'ok');
      } else {
        const data = await api('/auth/unlock', { method: 'POST', body: { pin } });
        setToken(data.token);
      }
      pinInput.value = '';
      confirmPinInput.value = '';
      await loadProtectedData();
      showSettings();
    } catch (error) {
      setMessage(gateMessage, error.message, 'error');
    }
  });

  lockBtn.addEventListener('click', async () => {
    try {
      await api('/auth/lock', { method: 'POST', body: {} });
    } catch (_error) {
      // Ignore lock errors; always clear local session.
    }
    clearToken();
    setMessage(configMessage, '');
    showGate();
  });

  configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(configMessage, '');

    const body = {
      deviceIp: document.getElementById('deviceIp').value.trim(),
      devicePort: Number(document.getElementById('devicePort').value),
      devicePassword: document.getElementById('devicePassword').value,
      typingDelay: Number(document.getElementById('typingDelay').value),
      duplicateSeconds: Number(document.getElementById('duplicateSeconds').value),
      pressEnter: document.getElementById('pressEnter').checked,
      httpPort: Number(document.getElementById('httpPort').value),
      autoStart: document.getElementById('autoStart').checked,
      logging: document.getElementById('logging').checked,
    };

    try {
      const data = await api('/config', { method: 'POST', body });
      fillConfig(data.config);
      setMessage(configMessage, data.message, 'ok');
      await loadStatus();
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    }
  });

  changePinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(pinMessage, '');
    try {
      await api('/auth/change-pin', {
        method: 'POST',
        body: {
          currentPin: document.getElementById('currentPin').value,
          newPin: document.getElementById('newPin').value,
        },
      });
      changePinForm.reset();
      setMessage(pinMessage, 'PIN updated.', 'ok');
    } catch (error) {
      setMessage(pinMessage, error.message, 'error');
    }
  });

  document.getElementById('testDeviceBtn').addEventListener('click', async () => {
    setMessage(configMessage, '');
    try {
      const data = await api('/test-device', { method: 'POST', body: {} });
      setMessage(configMessage, data.message, data.success ? 'ok' : 'error');
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    }
  });

  document.getElementById('testTypingBtn').addEventListener('click', async () => {
    setMessage(configMessage, '');
    try {
      const data = await api('/test-typing', {
        method: 'POST',
        body: { employeeId: '105' },
      });
      setMessage(configMessage, data.message, data.success ? 'ok' : 'error');
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    }
  });

  document.getElementById('simulatePunchBtn').addEventListener('click', async () => {
    setMessage(configMessage, '');
    try {
      const data = await api('/simulate-punch', {
        method: 'POST',
        body: { employeeId: '105' },
      });
      setMessage(configMessage, data.message, data.success ? 'ok' : 'error');
      const logs = await api('/logs');
      logsView.textContent = (logs.lines || []).join('\n');
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    }
  });

  document.getElementById('restartBtn').addEventListener('click', async () => {
    setMessage(configMessage, '');
    try {
      const data = await api('/restart', { method: 'POST', body: {} });
      setMessage(configMessage, data.message, 'ok');
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    }
  });

  document.getElementById('refreshLogsBtn').addEventListener('click', async () => {
    try {
      const logs = await api('/logs');
      logsView.textContent = (logs.lines || []).join('\n');
    } catch (error) {
      logsView.textContent = error.message;
    }
  });

  const refreshLicenseBtn = document.getElementById('refreshLicenseBtn');
  if (refreshLicenseBtn) {
    refreshLicenseBtn.addEventListener('click', async () => {
      const uploadMsg = document.getElementById('licenseUploadMessage');
      try {
        const license = await loadLicensePublic();
        applyLicenseToUi(license);
        if (uploadMsg) setMessage(uploadMsg, 'License status refreshed.', 'ok');
      } catch (error) {
        if (uploadMsg) setMessage(uploadMsg, error.message, 'error');
      }
    });
  }

  const copyMachineIdBtn = document.getElementById('copyMachineIdBtn');
  if (copyMachineIdBtn) {
    copyMachineIdBtn.addEventListener('click', async () => {
      try {
        const value = document.getElementById('gateMachineId').value;
        await copyText(value);
        setMessage(gateMessage, 'Machine ID copied.', 'ok');
      } catch (error) {
        setMessage(gateMessage, error.message, 'error');
      }
    });
  }

  const copyMachineIdSettingsBtn = document.getElementById('copyMachineIdSettingsBtn');
  if (copyMachineIdSettingsBtn) {
    copyMachineIdSettingsBtn.addEventListener('click', async () => {
      const uploadMsg = document.getElementById('licenseUploadMessage');
      try {
        await copyText(document.getElementById('machineId').textContent);
        if (uploadMsg) setMessage(uploadMsg, 'Machine ID copied.', 'ok');
      } catch (error) {
        if (uploadMsg) setMessage(uploadMsg, error.message, 'error');
      }
    });
  }

  const uploadLicenseBtn = document.getElementById('uploadLicenseBtn');
  if (uploadLicenseBtn) {
    uploadLicenseBtn.addEventListener('click', async () => {
      const uploadMsg = document.getElementById('licenseUploadMessage');
      const fileInput = document.getElementById('licenseFileInput');
      setMessage(uploadMsg, '');

      try {
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) {
          throw new Error('Choose a license.dat file first.');
        }
        const content = await file.text();
        const data = await api('/license/upload', {
          method: 'POST',
          body: { content },
        });
        applyLicenseToUi(data);
        if (fileInput) fileInput.value = '';
        setMessage(uploadMsg, data.message || 'License activated.', data.valid ? 'ok' : 'error');
      } catch (error) {
        setMessage(uploadMsg, error.message, 'error');
      }
    });
  }

  (async function init() {
    try {
      await loadStatus();
      await tryRestoreSession();
    } catch (error) {
      statusBadge.textContent = 'Offline';
      setMessage(gateMessage, error.message, 'error');
      showGate();
    }
  })();
})();
