# SmartManager Loyalty

Offline-first loyalty & customer-retention app for small businesses (Android / iOS via Capacitor) plus a separate **offline License Generator** desktop tool. No hosting, cloud database or AI API.

| Part | Path |
|---|---|
| Mobile app | `app/` |
| License Manager (offline one-page tool) | `license-manager/index.html` |
| Shared licensing protocol | `packages/license-core/` |
| Docs | `docs/` (start with PROJECT_AUDIT.md, ARCHITECTURE.md) |
| Archived hosted web app | `legacy/` |

## Quick start
```bash
npm install
npm test && npm run lint && npm run typecheck
npm run dev -w app                      # browser preview (sql.js)
# license generator: just double-click license-manager/index.html
```
Android/iOS builds: `docs/BUILD_ANDROID.md`, `docs/BUILD_IOS.md`. Licensing: `docs/LICENSING.md`, `docs/LICENSE_GENERATOR_GUIDE.md`.

## Typical rollout
1. Open `license-manager/index.html`, create the signing key, back it up, export the public key.
2. Put the public key in `app/trusted-keys.json`, build the APK (CI or locally).
3. Customer installs → activation screen → sends request → you issue a license → customer imports it.
