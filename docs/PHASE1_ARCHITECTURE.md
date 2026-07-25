# Phase 1 — Architecture & Planning

**Product display name:** PunchType  
**Executable / installer id:** PunchType  
**Platform:** Windows 10/11 (x64)  
**Runtime:** Node.js LTS (22.x recommended for packaging)  
**Language:** JavaScript only (ES2022+, CommonJS for ZK library compatibility)  
**TypeScript:** Not used anywhere in this project  

### Locked product decisions (approved by stakeholder)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Display name | **PunchType** | Short, professional, describes punch → keyboard typing |
| Devices (v1) | **Single device only** | Simpler config, license, reconnect; multi-device later |
| Unlicensed | **Block typing only** | Device may still connect; config UI remains usable; Machine ID visible for purchase |
| Config protection | **Local PIN required** | Loopback + PIN; PIN stored hashed inside `config.enc` |
| HTTP port | **Configurable** (default `47825`) | Avoid port conflicts on customer PCs |
| License expiry | **None in v1** | Machine-bound license only; no expiry field required |
| ZK comm password | **Optional config field** | Many devices use none; some need it — expose empty-by-default setting |
| Employee ID charset | **Alphanumeric** (`A–Z`, `a–z`, `0–9`, plus common `-` `_`) | Covers numeric badge IDs and alphanumeric card/user IDs used across ZK deployments |

---

## 1. Goal (Phase 1)

Define production architecture, folder structure, dependency choices, module contracts, security model, and phased delivery boundaries — **without writing application implementation code**.

Phase 1 produces a blueprint so Phase 2+ can be built incrementally with clear contracts.

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       PunchType.exe                             │
│                                                                 │
│  ┌──────────────┐  punch   ┌─────────────────┐  type  ┌──────┐ │
│  │ ZKTeco       │ ───────► │ Attendance      │ ─────► │ KB   │ │
│  │ Service      │          │ Orchestrator    │        │ Type │ │
│  └──────┬───────┘          └────────┬────────┘        └──────┘ │
│         │                           │                           │
│         │                    ┌──────┴──────┐                    │
│         │                    │ Duplicate   │                    │
│         │                    │ Filter      │                    │
│         │                    └─────────────┘                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Config       │  │ License      │  │ Logger               │  │
│  │ Service      │  │ Service      │  │ (file, daily rotate) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                     │
│  ┌──────┴─────────────────┴──────┐  ┌────────────────────────┐ │
│  │ HTTP Server (127.0.0.1 only)  │  │ Windows Startup        │ │
│  │ REST + static config UI       │  │ (HKCU Run / Task)      │ │
│  └───────────────────────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │ TCP/UDP :4370                    │ browser
         ▼                                  ▼
   ZKTeco Device (single, v1)       http://127.0.0.1:<httpPort>
```

### Design principles

| Principle | Application |
|-----------|-------------|
| Single Responsibility | Each service owns one concern (ZK, keyboard, config, license, logs, HTTP, startup) |
| Dependency Injection | Services receive collaborators via a composition root (`createApp` / `container`) |
| Open/Closed | ZK adapter behind a device-client contract so libraries can swap without rewriting orchestration |
| Interface Segregation | Narrow module APIs (`keyboardTyper`, `configStore`, `licenseVerifier`) |
| Dependency Inversion | Orchestrator depends on injected modules, not Express/zkteco-js/SendInput directly |
| JS quality without TS | JSDoc `@typedef` contracts, runtime validation at boundaries, ESLint recommended |

---

## 3. Folder Tree (planned)

```
zkteco/
├── docs/
│   ├── PHASE1_ARCHITECTURE.md      ← this document
│   ├── LICENSE_ISSUING.md          ← Phase 7 (seller tooling notes)
│   └── RELEASE.md                  ← Phase 8
├── src/
│   ├── index.js                    ← process entry / composition root
│   ├── app.js                      ← wire services, start lifecycle
│   ├── types/
│   │   ├── config.js               ← JSDoc typedefs + defaults helpers
│   │   ├── attendance.js
│   │   ├── license.js
│   │   └── common.js
│   ├── services/
│   │   ├── config/
│   │   │   ├── ConfigService.js
│   │   │   ├── ConfigCrypto.js
│   │   │   └── defaults.js
│   │   ├── zkteco/
│   │   │   ├── ZktecoService.js
│   │   │   ├── adapters/
│   │   │   │   ├── ZktecoJsAdapter.js
│   │   │   │   └── NodeZkLibAdapter.js
│   │   │   └── deviceClient.contract.js
│   │   ├── keyboard/
│   │   │   ├── KeyboardTypingService.js
│   │   │   ├── DuplicatePunchFilter.js
│   │   │   └── Win32SendInputTyper.js
│   │   ├── license/
│   │   │   ├── LicenseService.js
│   │   │   ├── HardwareFingerprint.js
│   │   │   └── RsaVerifier.js
│   │   ├── logger/
│   │   │   └── LoggerService.js
│   │   ├── startup/
│   │   │   └── WindowsStartupService.js
│   │   └── orchestrator/
│   │       └── AttendanceOrchestrator.js
│   ├── http/
│   │   ├── server.js
│   │   ├── routes/
│   │   │   ├── status.js
│   │   │   ├── config.js
│   │   │   ├── device.js
│   │   │   ├── license.js
│   │   │   └── logs.js
│   │   └── middleware/
│   │       ├── localOnly.js
│   │       └── errorHandler.js
│   ├── utils/
│   │   ├── paths.js
│   │   ├── errors.js
│   │   ├── retry.js
│   │   └── sleep.js
│   └── keys/
│       └── public.pem              ← RSA public key only (embedded at build)
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── license/                        ← runtime folder (customer machine)
│   └── license.dat                 ← installed by customer / seller
├── logs/                           ← runtime folder
├── tools/                          ← NOT shipped to customers
│   └── license-generator/          ← Phase 7 offline issuer (private key)
├── installer/
│   └── PunchType.iss               ← Inno Setup (Phase 8)
├── scripts/
│   ├── build.js
│   └── prepare-obfuscation.js
├── package.json
├── .eslintrc.cjs                   ← optional quality gate (no TypeScript)
├── .gitignore
└── README.md
```

**Runtime install layout (customer PC):**

```
C:\Program Files\PunchType\
├── PunchType.exe
├── public\
├── license\
│   └── license.dat
├── config.enc
└── logs\
```

---

## 4. Required Packages

### Runtime (production)

| Package | Purpose | Why chosen |
|---------|---------|------------|
| `express` | Local config HTTP API + static UI | Lightweight, mature, no UI framework needed |
| `zkteco-js` | Primary ZK device adapter | Matches requirement preference; exposes `getRealTimeLogs` |
| `node-zklib` | Fallback adapter | Wider field usage; same realtime API shape; polling fallback path |
| `koffi` | Call Win32 `SendInput` / `MapVirtualKey` | Reliable focus-preserving key injection without Electron/robotjs native rebuild pain |
| `systeminformation` | CPU, disk, board, UUID for fingerprint | Cross-checked hardware facts without shell scraping only |
| `uuid` | Correlation IDs in logs (optional) | Structured log lines |

**Built-in Node modules (no extra deps):** `crypto`, `fs/promises`, `path`, `os`, `child_process`, `events`.

### Dev / build

| Package | Purpose | Why chosen |
|---------|---------|------------|
| `nodemon` (optional) | Auto-restart during Phase 2+ dev | Fast JS iteration |
| `eslint` (optional) | Lint production JS | Quality without TypeScript |
| `javascript-obfuscator` | Obfuscation prep (Phase 8) | Commercial protection layer |
| `pkg` **or** Node SEA | Single `.exe` | Prefer **Node Single Executable Application** if Node 22+; else `pkg` |
| Inno Setup (external) | Windows installer | Industry standard for Start Menu + shortcuts + autostart |

### Explicitly rejected

| Rejected | Reason |
|----------|--------|
| TypeScript / `tsc` / `tsx` / `@types/*` | User requirement: JavaScript only |
| Electron / React / Vue / Angular / Next | Violates lightweight UI requirement |
| Tailwind / Bootstrap | Plain CSS only |
| SQLite / MongoDB / any DB | Config in `config.enc` only |
| `robotjs` | Native binary fragility across Node versions |
| `@nut-tree/nut-js` | Heavier; still focus/window concerns we do not need |
| Hardcoded AES key in plaintext | Prefer derived + obfuscated app secret material |

---

## 5. Files to Create (Phase 1 only)

| File | Status |
|------|--------|
| `docs/PHASE1_ARCHITECTURE.md` | **Updated (JS-only)** |
| Application source | Deferred to Phase 2+ |
| `package.json` | Deferred to Phase 2 |

---

## 6. Service Contracts (JSDoc shapes)

Contracts are documented with JSDoc and enforced with runtime validation at HTTP/config boundaries (no TypeScript).

### Config (decrypted shape)

```js
/**
 * @typedef {Object} AppConfig
 * @property {string} deviceIp
 * @property {number} devicePort          // default 4370
 * @property {string} devicePassword      // ZK comm key; "" when unused
 * @property {number} httpPort            // default 47825; loopback only
 * @property {number} typingDelay         // ms between keystrokes
 * @property {number} duplicateSeconds    // ignore same empId within window
 * @property {boolean} pressEnter
 * @property {boolean} autoStart
 * @property {boolean} logging
 * @property {string} settingsPinHash     // scrypt/argon2id hash of local PIN (never plaintext)
 * @property {string} settingsPinSalt
 */
```

**PIN rules (v1):**
- Required to open Settings UI actions that read/write sensitive config (after unlock session).
- Default first-run: force set PIN on first visit (or ship with one-time setup flow).
- PIN never returned by `GET /api/config`; only `{ pinConfigured: true/false }`.
- Session unlock via `POST /api/auth/unlock` with short-lived in-memory token (process lifetime).

### Attendance event

```js
/**
 * @typedef {Object} AttendancePunch
 * @property {string} employeeId
 * @property {Date} punchedAt
 * @property {string} deviceIp
 * @property {unknown} [raw]
 */
```

### License payload (inside signed `license.dat`) — v1 machine-bound, no expiry

```js
/**
 * @typedef {Object} LicensePayload
 * @property {string} customerName
 * @property {string} machineFingerprint
 * @property {string} productVersion
 * @property {{ multiDevice?: boolean, maxDevices?: number }} featureFlags  // multiDevice unused in v1
 * @property {string} issuedAt
 */

/**
 * @typedef {Object} LicenseFile
 * @property {LicensePayload} payload
 * @property {string} signature           // base64 RSA signature over canonical JSON
 */
```

**Unlicensed behavior (v1):** device connect + config UI allowed; **keyboard typing is blocked** until license validates for this Machine ID.

### Core module APIs (duck-typed / injected)

```js
/** @typedef {{ load: () => Promise<AppConfig>, save: (config: AppConfig) => Promise<void> }} IConfigStore */

/**
 * @typedef {Object} IDeviceClient
 * @property {() => Promise<void>} connect
 * @property {() => Promise<void>} disconnect
 * @property {() => Promise<{ ok: boolean, message: string }>} testConnection
 * @property {(handler: (punch: AttendancePunch) => void) => void} onPunch
 * @property {() => boolean} isConnected
 */

/**
 * @typedef {Object} IKeyboardTyper
 * @property {(text: string, options: { delayMs: number, pressEnter: boolean }) => Promise<void>} typeText
 */

/**
 * @typedef {Object} ILicenseService
 * @property {() => Promise<string>} getMachineId
 * @property {() => Promise<string>} validate
 * @property {() => Promise<object>} getInfo
 */

/**
 * @typedef {Object} ILogger
 * @property {(event: string, meta?: Record<string, unknown>) => Promise<void>} info
 * @property {(event: string, meta?: Record<string, unknown>) => Promise<void>} error
 */
```

---

## 7. HTTP API Contract

**Bind:** `127.0.0.1:<httpPort>` only (default `47825`; middleware rejects non-loopback).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Process, device connection, license summary (no secrets) |
| POST | `/api/auth/setup-pin` | First-run: set local PIN |
| POST | `/api/auth/unlock` | Verify PIN → short-lived session token |
| POST | `/api/auth/change-pin` | Change PIN (requires unlocked session) |
| GET | `/api/config` | Current settings (PIN-gated; never hashes/keys/password plaintext unless unlocked policy allows masked device password) |
| POST | `/api/config` | Validate + encrypt-save (PIN-gated) |
| POST | `/api/test-device` | One-shot device ping (PIN-gated) |
| POST | `/api/restart` | Soft-restart device listener + apply config (PIN-gated) |
| GET | `/api/license` | Machine ID, customer name, status (no expiry in v1) |
| GET | `/api/logs` | Tail recent log lines (PIN-gated) |

Static: `GET /` → `public/index.html` (PIN unlock gate in UI before settings)

**Note:** Changing `httpPort` requires restart; Settings page should warn that the URL will change.

---

## 8. Security Model

| Concern | Approach |
|---------|----------|
| Config at rest | AES-256-GCM; file `config.enc` = `iv \|\| authTag \|\| ciphertext` |
| Config key | Derived via scrypt/HKDF from app secret material + install path salt (details Phase 3) |
| License integrity | RSA-SHA256 verify with embedded **public** key only |
| License binding | Payload fingerprint must equal current machine fingerprint |
| Tamper | Invalid / missing / wrong-machine license → refuse to type punches only |
| Settings PIN | scrypt hash in `config.enc`; unlock session in memory only |
| Network | Loopback-only HTTP; no LAN bind |
| Secrets in binary | No private key; prepare string encryption / obfuscation (Phase 8) |
| Seller tooling | `tools/license-generator` holds private key offline; never shipped |

### Hardware fingerprint inputs

1. CPU identifiers  
2. BIOS UUID  
3. Motherboard serial  
4. System disk serial  
5. Windows Machine GUID (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`)  
6. Primary MAC address  

Canonical string → SHA-256 hex = **Machine ID** (display) / fingerprint (license bind).

---

## 9. ZKTeco Strategy

```
Try ZktecoJsAdapter (realtime)
        │
        ├─ success → keep listening + health ping
        │
        └─ fail / no events → NodeZkLibAdapter
                │
                ├─ realtime OK → keep
                │
                └─ else → Polling mode (getAttendances delta, ~1–2s)
```

Always:

- Exponential backoff reconnect (cap e.g. 60s), retry forever  
- Never crash process on device errors  
- Emit connected/disconnected to Logger + status API  

---

## 10. Keyboard Strategy

- Use Win32 **SendInput** via `koffi`  
- Type into **current focus** only — no `SetForegroundWindow`, no Activate  
- Type alphanumeric employee IDs via Unicode/`SendInput` (digits are included)  
- Reject/control characters outside allowed set before typing  
- Configurable inter-key delay  
- Optional virtual ENTER (`VK_RETURN`)  

---

## 11. Duplicate Filter

In-memory map: `employeeId → lastTypedAt`

```
if (now - lastTypedAt < duplicateSeconds * 1000) → ignore
else → type + update lastTypedAt
```

No database; map cleared on process restart (acceptable for utility).

---

## 12. Windows Startup

- Persist `autoStart` in config  
- When true: write `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value pointing to exe  
- When false: remove value  
- Installer also offers “Start with Windows” checkbox (Phase 8)

---

## 13. Packaging (Phase 8 preview)

1. Copy/bundle `src/` + `public/` (no TypeScript compile step)  
2. Obfuscate sensitive JS with `javascript-obfuscator`  
3. Bundle to `PunchType.exe`  
4. Inno Setup: copy files, Start Menu, “Open Settings” shortcut (`http://127.0.0.1:<port>`), optional Run key  

---

## 14. Phase Boundaries (locked)

| Phase | Deliverable | Stop after |
|-------|-------------|------------|
| 1 | Planning / architecture | **NOW** |
| 2 | Init + Express + basic HTML + config load stub | Wait |
| 3 | Encrypted ConfigService | Wait |
| 4 | ZKTeco service | Wait |
| 5 | Keyboard + duplicates | Wait |
| 6 | Logger + background + startup | Wait |
| 7 | Fingerprint + RSA license | Wait |
| 8 | Installer + obfuscation + release | Wait |

All phases use **JavaScript only**.

---

## 15. Commands (Phase 1)

None required. Planning only.

Optional local check:

```bash
node -v   # should be >= 20 LTS; target 22 LTS for SEA packaging
```

---

## 16. Testing Instructions (Phase 1)

1. Review this document end-to-end.  
2. Answer open questions below.  
3. Approve Phase 1 → then Phase 2 may begin.

---

## 17. Improvements / Risks

| Item | Note |
|------|------|
| `zkteco-js` production warning | Upstream marks “not production”; mitigate with adapter + `node-zklib` + polling |
| Realtime flaky on some firmwares | Always implement polling fallback |
| Dev on macOS | Implementation/dev possible on macOS for HTTP/config; **ZK + SendInput + startup must be validated on Windows** |
| Config UI auth | Local PIN required (locked) |
| Multi-device | Single device in v1 (locked); architecture can extend later |
| Unlicensed | Typing blocked only (locked) |
| No TypeScript | Rely on JSDoc + runtime validation + ESLint for maintainability |
| Port change | Requires process restart after save |

---

## 18. Open Questions

**All prior open questions are resolved.** Remaining optional polish (can decide in later phases):

1. Default first-run PIN flow: force setup wizard vs temporary empty until set? (**Recommend:** force setup before any config save.)  
2. Settings shortcut: open default port URL, or a small helper that reads `httpPort` from config? (**Recommend:** helper/shortcut that launches `http://127.0.0.1:<savedPort>`.)  
