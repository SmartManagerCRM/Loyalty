# Project audit

## What was supplied
* `smartmanagerloyalty.zip` — **compiled Vite/React output only** (`index-*.js`, `index-*.css`, icons, `.htaccess`, manifest). No source. It was not used as a source of truth.
* The repository already contained the **original source** of a hosted web app (React + Vite + Tailwind + Supabase, multi-tenant, plans/billing/admin, bookings, memberships). It is now archived in `legacy/` (history preserved with `git mv`).
* `SmartManager_Loyalty_Master_Claude_Code_Prompt.md` — the build brief.

## Reusable from the legacy app
| Item | Reused how |
|---|---|
| Brand palette, logo mark, icons (`public/`) | Colours and icon art carried into the new design system and launcher icons |
| Segmentation concept (recency vs. each customer's own cycle, explainable next-best-action) | Re-implemented as local deterministic scoring in `app/src/domain/scoring.ts` (no SQL views, no server) |
| Message-template idea and EN/AR wording | Re-written as editable templates with `{placeholders}` (`domain/templates.ts`) |
| CSV import column auto-matching | Re-implemented with mapping, preview, validation and error report (`domain/csv.ts`, `repositories/importExport.ts`) |
| Points / VIP / offers concepts | Re-modelled on an append-only points ledger (`repositories/loyalty.ts`) |
| Locale JSON (en/fr/ar) | Not reusable (keys tied to old pages). New EN/AR dictionaries written; French can be added (see ARCHITECTURE) |

## Not carried over (conflicts with the offline brief)
Supabase auth/RLS/realtime, multi-tenant accounts, subscription plans and billing, platform admin, team invites, bookings calendar, memberships/session packages, public pricing page. These require a backend or are outside the loyalty/retention scope.

## Risks and decisions
* **Rebuild rather than port**: the legacy app is JS + a Postgres schema with logic in SQL views; an offline SQLite app needed a new domain layer.
* **Money** is integer minor units everywhere (legacy used floats).
* **Points** are an append-only ledger (legacy recomputed from spend).
* **Android build environment**: the SDK host (`dl.google.com`) was unreachable from the authoring sandbox, so the APK is built by GitHub Actions (`.github/workflows/android.yml`) rather than locally. See BUILD_ANDROID.md.
* **iOS** cannot be built without macOS/Xcode; the Capacitor iOS project is generated and documented only.
* **Licensing without a server** cannot prevent a device owner from tampering with the OS clock or cloning storage; see LICENSING.md for exact guarantees.

## Implementation order followed
Audit → architecture/migrations → customers + CSV → ledger/rewards/VIP/offers → Smart Actions → dashboard/reports → backup/restore → licensing protocol + tests → desktop generator → app integration → tests/lint/builds → docs.
