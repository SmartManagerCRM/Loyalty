# Architecture

```
packages/license-core   shared, dependency-light licensing protocol (Ed25519 via @noble/curves)
app/                    React + TypeScript UI, Capacitor (Android + iOS), native SQLite
license-manager/        one-page offline License Manager (like SmartManager Installments), offline signing
legacy/                 archived Supabase web app (not built)
```

## App layers (`app/src`)
| Layer | Path | Rules |
|---|---|---|
| UI | `features/`, `components/`, `app/` | React; no SQL. Calls services only |
| Services / repositories | `repositories/` | All business rules and **all multi-row writes in DB transactions**; validation lives here, not in the UI |
| Domain | `domain/` | Pure functions: money, dates, earn rule, scoring/eligibility, templates, CSV, backup crypto |
| Database | `database/` | `Db` interface; adapters `capacitorSqlite.ts` (native) and `sqljs.ts` (tests / browser preview); migrations |
| Licensing | `services/licensing.ts` | `LicenseManager`: device identity, verification, validity, clock-rollback handling |

* `Db` has `run/all/get/transaction`. `SerialDb` serialises access with a mutex so transactions never interleave. **Inside a transaction always use the `tx` handle** (using `ctx.db` would wait on the lock held by the transaction).
* Every mutating method calls `ctx.assertWritable()`, wired to `LicenseManager.assertWritable()`. Read, export and backup never call it, so an expired license cannot block them.
* UI buttons marked `write` are disabled in read-only mode, but enforcement is in the services.
* Scoring is deterministic and explainable: each candidate carries structured `Reason`s (`{key, params}`) translated by the UI.

## Internationalisation
`i18n/en.ts`, `i18n/ar.ts`, `i18n/fr.ts` flat dictionaries; RTL via `document.dir` and CSS logical properties. A test asserts all three files have identical keys/placeholders and that every referenced key exists. **Adding another language**: create `i18n/xx.ts` (same keys), register it in `DICTIONARIES` and `LANGUAGES` in `i18n/index.ts` and in the `Language` type; missing keys fall back to English. French, Arabic and English are included.

## Offline guarantees
No analytics, no network calls from app code. The Android manifest declares **no INTERNET permission** and disables cloud/device-transfer backup. External apps (WhatsApp, dialer, SMS, mail) are launched through links; the user sends messages manually.
