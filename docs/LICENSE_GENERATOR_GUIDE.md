# License Generator guide

Separate desktop app (Electron) in `license-generator/`. It never touches the network (all requests are blocked), keeps data in the OS user-data folder (`…/data/signing-key.smlkey`, `license-history.json`) and exposes no private-key export.

## Run / build
```bash
npm install                       # from repo root
npm run build -w license-generator
npx electron license-generator    # run
npm run dist -w license-generator # installers into license-generator/release (run on the target OS)
```
CI builds Windows/macOS/Linux packages (`.github/workflows/license-generator.yml`). Installers are unsigned unless you add code-signing certificates.

## Quick use (the normal workflow)
1. First run only: choose a passphrase → **Create** → save the public key file and key backup (see below).
2. Customer sends the **request code** (`SMLYREQ1:…`) from the app.
3. Paste it in **Generate license**, check the customer name, pick *Lifetime* or a number of months, click **Generate license**, enter the passphrase.
4. **Copy license** (or Save as file) and send it back. The customer pastes it in the app.
History, key backup and history backup are under the small links at the top.

## 1. Create the signing key (once)
Signing key → choose a passphrase (≥12 chars) → tick the two acknowledgements → Create. Then immediately:
1. **Save public key file…** → `trusted-keys.json`. Put it at `app/trusted-keys.json` (or run `npm run keys:import -w app -- <file>`, or set the GitHub repository variable `LICENSE_TRUSTED_KEYS` to its contents) and **rebuild the app**. Apps built before the key existed cannot activate.
2. **Save encrypted key backup…** (`.smlkey`). Store it and the passphrase **separately**, in at least two safe places. If you lose the key or passphrase you cannot issue licenses that existing installs accept.
The tool refuses to create or import a key when one exists, so a replacement can never happen silently.

## 2. Issue a license
1. Customer: app → activation screen → *Share request file* (or *Copy request text*).
2. Generator → **New license** → open the file or paste the text → review product, device fingerprint, platform.
3. Enter the customer/business reference and internal notes. Choose **Lifetime** or **Fixed period** (months or an end date; valid through the end of that day in the generator computer's timezone).
4. **Sign & issue** (unlock the key with the passphrase). Save the `.smloyaltylicense` file or copy the text and send it to the customer.
5. Customer: app → import file / paste text → activated. The license is recorded in **License history**.

A device with an active license cannot receive a second one; use **Renew** (same device) or **Replace device** from the license details.

## 3. Renew / replace device
* **Renew**: new request from the same device → new license supersedes the old record.
* **Replace device (reissue)**: new request from the new device; reason (≥5 chars) and a confirmation are mandatory; the old record is marked *replaced* with the reason. The old device is **not** revoked (offline limitation).

## 4. History, backup, restore
* History: search, filter by type/status (active, expiring ≤30 days, expired, replaced), details, re-save the file.
* **Backup & restore → Export history backup** writes `.smlhistory` (JSON + SHA-256 checksum, no private key). Import merges; existing records are never overwritten; conflicts are reported.
* Key backup/restore: Signing key page. Restoring on a new computer works only when no key exists there.

## Security notes
Passphrase protection only (no OS keychain integration). The key is decrypted into memory to sign and auto-locks after 10 minutes of inactivity or on close. Back up the history file; it is the only record of issued licenses.
