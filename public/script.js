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
  const systemAlert = document.getElementById('systemAlert');
  const logsPathEl = document.getElementById('logsPath');

  let pinConfigured = false;
  let unlocked = false;
  let logsTimer = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderLogs(lines) {
    if (!lines || !lines.length) {
      logsView.innerHTML = '<div class="log-line">No log entries yet.</div>';
      return;
    }

    logsView.innerHTML = lines
      .map((line) => {
        let className = 'log-line';
        if (line.startsWith('---')) {
          className += ' marker';
        } else if (line.includes('[ERROR]')) {
          className += ' error';
        } else if (line.includes('[INFO]')) {
          className += ' info';
        }
        return `<div class="${className}">${escapeHtml(line)}</div>`;
      })
      .join('');
  }

  function setBadgeState(el, state) {
    el.classList.remove('ok', 'warn', 'error');
    if (state) {
      el.classList.add(state);
    }
  }

  function updateStatusDashboard(status) {
    const device = status.device || {};
    const adms = status.adms || null;
    const license = status.license || {};
    const startup = status.startup || {};
    const pushMode = status.connectionMode === 'push' || status.connectionMode === 'both';

    let connectionText = 'Not configured';
    let connectionClass = 'warn';

    if (pushMode && adms && adms.listening) {
      if (adms.connected) {
        connectionText = `ADMS connected (port ${status.admsPort})`;
        connectionClass = 'ok';
      } else {
        connectionText = `ADMS listening on port ${status.admsPort} — waiting for device`;
        connectionClass = 'warn';
      }
    } else if (device.connected) {
      connectionText = `Connected via ${device.adapter || 'device'} (${device.mode || 'on'})`;
      connectionClass = 'ok';
    } else if (device.running && device.ip) {
      connectionText = device.lastError ? `Reconnecting — ${device.lastError}` : 'Reconnecting…';
      connectionClass = 'warn';
    } else if (device.ip) {
      connectionText = device.lastError || 'Stopped';
      connectionClass = device.lastError ? 'error' : 'warn';
    }

    const statusConnection = document.getElementById('statusConnection');
    const statusLicense = document.getElementById('statusLicense');
    const statusStartup = document.getElementById('statusStartup');

    if (statusConnection) {
      statusConnection.textContent = connectionText;
      statusConnection.className = `value ${connectionClass}`;
    }

    if (statusLicense) {
      const licenseText = license.valid
        ? `Valid — ${license.customerName || 'activated'}`
        : license.status || 'Not activated';
      statusLicense.textContent = licenseText;
      statusLicense.className = `value ${license.valid ? 'ok' : 'error'}`;
    }

    if (statusStartup) {
      if (!startup.supported) {
        statusStartup.textContent = 'Not applicable on this OS';
        statusStartup.className = 'value';
      } else if (startup.enabled) {
        statusStartup.textContent = 'Enabled — runs in background on boot';
        statusStartup.className = 'value ok';
      } else {
        statusStartup.textContent = 'Disabled';
        statusStartup.className = 'value warn';
      }
    }

    if (systemAlert) {
      if (device.lastError && !device.connected) {
        systemAlert.textContent = device.lastError;
        systemAlert.classList.remove('hidden');
      } else {
        systemAlert.textContent = '';
        systemAlert.classList.add('hidden');
      }
    }
  }

  function startLogsPolling() {
    if (logsTimer) {
      clearInterval(logsTimer);
    }
    logsTimer = setInterval(async () => {
      if (!unlocked) {
        return;
      }
      try {
        const logs = await api('/logs');
        renderLogs(logs.lines || []);
        if (logsPathEl && logs.logsDir) {
          logsPathEl.textContent = `Log folder: ${logs.logsDir}`;
        }
      } catch (_error) {
        // ignore background refresh errors
      }
    }, 8000);
  }

  function stopLogsPolling() {
    if (logsTimer) {
      clearInterval(logsTimer);
      logsTimer = null;
    }
  }

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

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
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
    stopLogsPolling();
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
    startLogsPolling();
    gatePanel.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    lockBtn.classList.remove('hidden');
  }

  function fillConfig(config) {
    document.getElementById('connectionMode').value = config.connectionMode || 'pull';
    document.getElementById('deviceIp').value = config.deviceIp || '';
    document.getElementById('devicePort').value = config.devicePort;
    document.getElementById('admsPort').value = config.admsPort || 8088;
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
    const adms = status.adms || null;
    const pushMode = status.connectionMode === 'push' || status.connectionMode === 'both';

    footerStatus.textContent = `${status.product} · uptime ${status.uptimeSeconds}s · settings ${status.httpPort}${pushMode ? ` · ADMS ${status.admsPort}` : ''}`;

    updateStatusDashboard(status);

    if (pushMode && adms && adms.listening) {
      if (adms.connected) {
        deviceBadge.textContent = `ADMS: connected (port ${status.admsPort})`;
        setBadgeState(deviceBadge, 'ok');
      } else {
        deviceBadge.textContent = `ADMS: listening on port ${status.admsPort}`;
        setBadgeState(deviceBadge, 'warn');
      }
    } else if (!device.ip) {
      deviceBadge.textContent = 'Device: not configured';
      setBadgeState(deviceBadge, 'warn');
    } else if (device.connected) {
      deviceBadge.textContent = `Device: connected (${device.mode || 'on'})`;
      setBadgeState(deviceBadge, 'ok');
    } else if (device.running) {
      deviceBadge.textContent = `Device: reconnecting`;
      setBadgeState(deviceBadge, 'warn');
    } else {
      deviceBadge.textContent = device.lastError ? 'Device: error' : 'Device: stopped';
      setBadgeState(deviceBadge, device.lastError ? 'error' : 'warn');
    }

    setBadgeState(statusBadge, 'ok');

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
    renderLogs(logs.lines || []);
    if (logsPathEl && logs.logsDir) {
      logsPathEl.textContent = `Log folder: ${logs.logsDir}`;
    }
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
      connectionMode: document.getElementById('connectionMode').value,
      deviceIp: document.getElementById('deviceIp').value.trim(),
      devicePort: Number(document.getElementById('devicePort').value),
      admsPort: Number(document.getElementById('admsPort').value),
      typingDelay: Number(document.getElementById('typingDelay').value),
      duplicateSeconds: Number(document.getElementById('duplicateSeconds').value),
      pressEnter: document.getElementById('pressEnter').checked,
      httpPort: Number(document.getElementById('httpPort').value),
      autoStart: document.getElementById('autoStart').checked,
      logging: document.getElementById('logging').checked,
    };

    const devicePassword = document.getElementById('devicePassword').value.trim();
    if (devicePassword) {
      body.devicePassword = devicePassword;
    }

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
    const btn = document.getElementById('testTypingBtn');
    btn.disabled = true;
    try {
      for (let seconds = 3; seconds >= 1; seconds -= 1) {
        setMessage(
          configMessage,
          `Switch to the target window — typing 105 in ${seconds} second${seconds === 1 ? '' : 's'}…`,
          'ok',
        );
        await sleep(1000);
      }
      const data = await api('/test-typing', {
        method: 'POST',
        body: { employeeId: '105', focusReady: true },
      });
      setMessage(configMessage, data.message, data.success ? 'ok' : 'error');
    } catch (error) {
      setMessage(configMessage, error.message, 'error');
    } finally {
      btn.disabled = false;
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
      renderLogs(logs.lines || []);
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
      renderLogs(logs.lines || []);
    } catch (error) {
      logsView.innerHTML = `<div class="log-line error">${escapeHtml(error.message)}</div>`;
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
