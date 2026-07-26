# PunchType

Commercial Windows utility: ZKTeco attendance punches → keyboard typing into the focused application.

## Features

- LAN connection to a single ZKTeco device (realtime + polling fallback)
- Types Employee ID (optional ENTER) without stealing focus
- Duplicate punch filter
- Encrypted `config.enc` + local PIN-protected settings UI
- Machine-bound RSA license (`license.dat`)
- File logging, Windows autostart, silent `--background` mode

## Settings UI

Loopback only: `http://127.0.0.1:47825` (port configurable)

## Development

```bash
npm install
npm start
```

## License issuing (seller only)

Private key lives in `tools/license-generator/keys/private.pem` — **never ship to customers**.

```bash
# Customer copies Machine ID from Settings (unlock screen or License panel)
node tools/license-generator/issue.js --customer "Acme Corp" --machine <64-char-sha256> --out license.dat
```

Email `license.dat`. Customer unlocks Settings → **Upload & Activate**.

Public website download = app only. License is sent after payment + Machine ID.

## Production build (Windows — Option A installer)

On a **Windows** PC:

1. Install [Node.js LTS](https://nodejs.org) and [Inno Setup 6](https://jrsoftware.org/isinfo.php)
2. Run `scripts\build-installer.bat`  
   or:
   ```powershell
   npm install
   npm run build
   npm run build:installer
   ```
3. Upload **`release\PunchType-Setup-1.0.0.exe`** to your website

Customer installs to `C:\Program Files\PunchType\`, then can delete the Setup file.  
**No Node.js required on the customer PC.**

## Phase status

Phases 1–8 implemented. Validate ZK device connectivity and SendInput typing on the office Windows PC when the device TCP port is reachable.
