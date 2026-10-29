# License Manager (the license generator)

Same system as the SmartManager Installments **License Manager**: **one offline web page**, no server, no install. Open `license-manager/index.html` by double-clicking it (Chrome, Edge or Firefox). Nothing is uploaded: the page declares a Content-Security-Policy with no network access.

```
license-manager/
  index.html     the tool (generated, self-contained: logic + crypto inlined) - this is the file you use
  template.html  page source          src/core.ts  all logic (also used by the tests)
  build.mjs      `npm run build -w license-manager` regenerates index.html
  tests/         unit tests (`npm test -w license-manager`)
```

## Everyday job (30 seconds)
1. The customer opens the app → activation screen → **Share / Copy request** and sends you the text (`SMLYREQ1:…`) or just the **Device ID**.
2. Open `index.html` → tab **2. Issue license**: type your key **passphrase**, paste the request/Device ID, enter the **customer name** (and optional order reference), choose **Lifetime** or **Subscription: N days** (counted from today, valid through the end of the last day in the chosen time zone; default = this computer's zone), press **Issue license**.
3. A `.smloyaltylicense` file downloads and the **one-line license code** (`SMLYLIC1:…`) is shown. Send the file or the code. The customer imports/pastes it in the app → activated, offline.

## Tab 3 – Customers & licenses
Register of every license (latest revision of each), colour-coded ACTIVE / EXPIRED / NOT YET VALID, searchable. **Renew / change validity** (same phone, no new request needed), **New phone (replacement)** (needs the new phone's code, a reason and the identity-check box), **History**, **Download license file**, **Copy license code**, **Export CSV**. Issuing for a device that already has an active license asks whether to replace it (revision + 1).

## Tab 1 – Keys (first time only)
Choose a passphrase (≥10 chars) → **Create new signing key**. The key is stored **encrypted in this browser** (PBKDF2-SHA256 600 000 iterations + AES-256-GCM) and a backup `.smlkey` downloads. Then **Export public key for the app (.json)** → save as `app/trusted-keys.json` (or paste into the GitHub repository variable `LICENSE_TRUSTED_KEYS`) and **rebuild the app** — apps built before that cannot activate.

**Browser storage warning:** the key and the register live in this browser profile. Clearing site data, another browser/profile or another computer loses them. Keep **two offline copies of the `.smlkey`** (passphrase separately) and use **Download register backup** regularly; **Restore** brings both back on any computer. Losing the key = you cannot issue licenses that shipped apps accept. The page never creates a second key silently (it asks before replacing).

## Tab 4 – Verify
Runs the same checks as the app (signature, product, device, validity) against a public key and a Device ID.

## Compatibility
Licenses are the `schemaVersion 1` Ed25519 format from `packages/license-core` (see LICENSING.md); the page bundles that exact code, and the tests verify its output with the app-side verifier. The Installments tool uses ECDSA P-256 for its own product; the two products reject each other's licenses (different product id and format).

## Honest limits
Offline licenses cannot be revoked remotely; subscriptions rely on the phone's clock; the key lives in browser storage (not an OS keychain) — only open a copy of `index.html` you trust and keep backups.
