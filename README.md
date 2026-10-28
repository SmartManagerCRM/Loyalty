# SmartManager Loyalty

Offline-first loyalty & customer-retention app for small businesses (Android / iOS via Capacitor) plus a separate **offline License Generator** desktop tool. No hosting, cloud database or AI API.

| Part | Path |
|---|---|
| Mobile app | `app/` |
| License Generator (Electron) | `license-generator/` |
| Shared licensing protocol | `packages/license-core/` |
| Docs | `docs/` (start with PROJECT_AUDIT.md, ARCHITECTURE.md) |
| Archived hosted web app | `legacy/` |

## Quick start
```bash
npm install
npm test && npm run lint && npm run typecheck
npm run dev -w app                      # browser preview (sql.js)
npm run build -w license-generator && npx electron license-generator
```
Android/iOS builds: `docs/BUILD_ANDROID.md`, `docs/BUILD_IOS.md`. Licensing: `docs/LICENSING.md`, `docs/LICENSE_GENERATOR_GUIDE.md`.

## Typical rollout
1. Run the generator, create the signing key, back it up, save the public key file.
2. Put the public key in `app/trusted-keys.json`, build the APK (CI or locally).
3. Customer installs → activation screen → sends request → you issue a license → customer imports it.
