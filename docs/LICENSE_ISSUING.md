# License Issuing (Seller)

## What customers download from your website

Ship **PunchType** (installer or release folder with `PunchType.exe` + required assets).  
They do **not** get a license file with the download.

## Customer activation flow

1. Customer downloads & runs PunchType
2. Opens Settings (`http://127.0.0.1:47825`)
3. Copies **Machine ID** (shown on the unlock screen)
4. Pays you (manual payment — bank transfer, etc.)
5. Sends you Machine ID + payment proof
6. You issue `license.dat` and email it
7. Customer unlocks Settings → **License** → **Upload & Activate**

## Keys

| Key | Location | Ships to customer? |
|-----|----------|--------------------|
| Private | `tools/license-generator/keys/private.pem` | **Never** |
| Public | `src/keys/public.pem` | Yes (inside app) |

## Issue a license (seller PC)

```bash
node tools/license-generator/issue.js \
  --customer "Customer Name" \
  --machine <64-char-sha256-machine-id> \
  --out license.dat
```

Email `license.dat` to the customer. They upload it in the Settings UI.

## Notes

- Machine-bound only (no expiry in v1)
- Upload rejects wrong Machine ID or tampered files
- Typing stays blocked until license status is `valid`
- Device connection and settings still work before activation
