# Licensing

Offline, one device per license, Ed25519 signatures. Code: `packages/license-core`, `app/src/services/licensing.ts`, `license-manager/src/core.ts`.

## Flow
1. App creates a random **installation ID** in secure storage (Android Keystore-backed / iOS Keychain via `capacitor-secure-storage-plugin`). The **device fingerprint** = first 100 bits of `SHA-256("smartmanager-loyalty|device-binding|v1|" + installId)`, shown as `XXXX-XXXX-XXXX-XXXX-XXXX`.
2. App exports an **activation request** (`.smloyaltyrequest` file or `SMLYREQ1:` text) with product, fingerprint, platform, optional business name and a checksum (typo detection).
3. Owner imports it in the **License Generator**, reviews it, chooses *Lifetime* or *Fixed period*, signs.
4. Generator exports `.smloyaltylicense` (JSON) or compact `SMLYLIC1:` text.
5. App verifies **offline** and activates.

## Signed payload (`schemaVersion 1`)
`schemaVersion, productId ("smartmanager-loyalty"), licenseId (UUID), customerReference, licenseType (lifetime|custom_duration), issuedAt, validFrom, expiresAt (null for lifetime), deviceBinding {type, value}, features[], keyId, metadata{requestId, replaces?}`.
The envelope stores the **canonical JSON string** (sorted keys, no whitespace, integers only). The signature is over `"SMARTMANAGER-LOYALTY-LICENSE-V1\n" + canonical`. The verifier also re-canonicalises and rejects non-canonical payloads.

## Verification order
file structure → format → schema version → `keyId` in the app's **approved key list** (with optional `notBefore/notAfter` issue window; no remote key fetching) → Ed25519 signature → canonical form → field validation → product → device binding. Validity dates are evaluated separately (half-open `validFrom ≤ t < expiresAt`).
Verification happens at **startup** and on import; the stored license is re-verified every launch, so editing the database or preferences grants nothing.

## Clock handling (honest limits)
* Lifetime licenses ignore the clock.
* The app stores the highest time it has seen (database **and** secure storage). Time moving back by more than 48 h → `clock_anomaly` (read-only). Fixing the clock recovers automatically; if the stored mark is wrong the user may confirm the date up to 2 times (`MAX_CLOCK_REVIEWS`). A rollback never revives an expired license.
* A device owner who controls the OS can still defeat any offline check (e.g. by clearing app data and re-importing the license, or by editing the system time just before launch within the tolerance). This design raises the cost; it does not make tampering impossible, and does not claim to.
* Timezones: all comparisons are on UTC instants; tests cover Kiritimati/Los Angeles/UTC.

## Expiry policy
After expiry/anomaly/unlicensed the app is **read-only**: view, search, export (CSV) and **backup** keep working; add/edit/redeem/import/outreach are blocked in the service layer. **Data is never deleted or modified.**

## Device replacement / reinstall
Reinstalling on Android deletes Keystore-backed data → new fingerprint → the old license shows "different device". Use **New phone (replacement)** in the License Manager (reason + identity check required). Offline licenses **cannot be revoked**: the old device keeps working if it still has the license. Use fixed-period licenses when you may need to end access. iOS Keychain items normally survive reinstall on the same device.

## Keys
* Private key: only in the License Manager, stored encrypted in the browser (PBKDF2-SHA256 600k + AES-256-GCM, header authenticated) with a passphrase-encrypted `.smlkey` backup. No export of the raw key. See LICENSE_GENERATOR_GUIDE.md.
* App: only `trusted-keys.json` (public keys). `scripts/check-no-private-key.mjs` scans `dist`, native asset folders and built APK/AAB/IPA for key material; it runs in CI. The built bundle does not contain `signLicense`/`generateSigningKey` (tree-shaken).
* Rotation: add the new public key next to the old one in `trusted-keys.json`; use `notAfter` on the old key to stop accepting licenses issued after a date.
