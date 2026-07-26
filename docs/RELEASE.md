# PunchType — Option A installer (what to put on your website)

## What the customer downloads

**One file only:** `PunchType-Setup-1.0.0.exe`

They do **not** need Node.js.  
They do **not** need a zip of folders.

## What happens on their PC

1. Run `PunchType-Setup-1.0.0.exe`
2. App installs to `C:\Program Files\PunchType\`
3. Start Menu shortcuts are created
4. Optional: start with Windows
5. They can **delete** the downloaded Setup.exe afterward

Installed folder contains the exe plus read-only assets (`public`, `keys`).

Writable data (config, license, logs) is stored under:

`%LOCALAPPDATA%\PunchType\`

(e.g. `C:\Users\<You>\AppData\Local\PunchType\`) — not under Program Files, so license upload works without Administrator rights.

## How you build it (on Windows)

### Requirements

- Windows 10/11 PC  
- [Node.js LTS](https://nodejs.org)  
- [Inno Setup 6](https://jrsoftware.org/isinfo.php)

### Easy way

Double-click:

`scripts\build-installer.bat`

### Manual way

```powershell
cd path\to\zkteco
npm install
npm run build
npm run build:installer
```

### Output to upload

`release\PunchType-Setup-1.0.0.exe` ← put this on your website

## After install — customer activation

1. Open **PunchType Settings** (Start Menu) → `http://127.0.0.1:47825`
2. Copy **Machine ID**
3. Pay you → send Machine ID
4. You email `license.dat`
5. Customer: Settings → License → **Upload & Activate**

## Artifacts

| File | Purpose |
|------|---------|
| `dist\PunchType.exe` | Built app (used by installer) |
| `release\PunchType-Setup-1.0.0.exe` | **Website download** |
