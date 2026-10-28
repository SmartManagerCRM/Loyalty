# Testing

```bash
npm install
npm run lint            # eslint (all workspaces)
npm run typecheck       # tsc --noEmit (all workspaces)
npm test                # vitest (license-core, app, license-generator)
npm run build -w app && node scripts/check-no-private-key.mjs
```

## Automated (all run in CI)
| Suite | Covers |
|---|---|
| `packages/license-core` (21) | valid lifetime/custom licenses, wrong product/device, altered payload, bad signature, untrusted key, malformed/missing fields, unknown schema/format, non-canonical payload, key issue windows, Node-Ed25519 interop, validity boundaries, clock jitter/rollback, timezone independence |
| `app/src/tests/domain` (22) | money (no floats), earn rule, DST-safe dates, birthdays, phones, sanitising, templates, CSV, scoring/eligibility, DNC |
| `app/src/tests/loyalty` (13) | customers CRUD/search/duplicates, ledger, redemption rules, reversal, atomic rollback, license read-only enforcement, offers |
| `app/src/tests/flows` (21) | CSV preview/commit, Smart Action outcomes (no false delivery), dashboard/report numbers, backup/restore (encrypted, corrupted, tampered, atomic failure, 1 500 customers, no license in backup), app-side licensing (activation, wrong device, tamper, expiry keeps data + export, rollback, renewal, restart re-verification) |
| `app/src/tests/i18n` (5) | EN/AR parity, placeholders, referenced keys exist |
| `license-generator` (16) | key encryption/lock/tamper/no silent replace/backup+restore, issuing, validation, renew/reissue rules, history search/summary/backup/merge |

## UI checks run during development (not part of CI)
* Chromium/Playwright against the production build in a 390×844 viewport: activation (garbage/wrong-device/valid), setup, add customer, purchase (+points), CSV import, Today recommendations, win-back workflow → compose → run → copy (status `prepared`, not `contacted`), Loyalty, Reports, Backup/License pages, Arabic RTL, persistence across reload — 17/17 steps passed.
* The generator was launched in real Electron (under Xvfb): create key, parse request, issue lifetime license, history, duplicate-device block, outbound network blocked; the issued file then verified with `license-core` against the public key.
* Not tested: native Android/iOS runtime (SQLite plugin, Keystore, share sheet, file picker) — requires a device/emulator; see BUILD_*.md checklists.
