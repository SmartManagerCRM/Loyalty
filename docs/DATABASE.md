# Database

SQLite (native via `@capacitor-community/sqlite`; sql.js for tests/browser preview). Foreign keys are ON. Timestamps are UTC ISO-8601 strings; "calendar dates" (birthday, follow-up due, offer dates) are local `YYYY-MM-DD`. Money is `INTEGER` minor units. Migrations: `app/src/database/migrations/` (recorded in `schema_migrations`; a newer-than-known schema refuses to open).

| Table | Purpose |
|---|---|
| `app_settings` | JSON key/value: business, locale, currency, earn rule, scoring thresholds, custom fields/outcomes |
| `customers` | profile, normalised phone/email for duplicate detection, consent (`granted/unknown/do_not_contact`), archive flag |
| `tags`, `customer_tags` | tags |
| `transactions` | purchases (`amount_minor`, `points_earned`, `status active/reversed`, `source manual/import`) |
| `points_ledger` | **source of truth for points**; append-only; `reverses_entry_id` is UNIQUE so an entry can be reversed once |
| `rewards`, `reward_redemptions` | catalogue and redemption history (name/cost snapshotted) |
| `vip_tiers` | thresholds (visit days AND/OR spend) and points multiplier |
| `offers`, `customer_offers`, `offer_redemptions` | offers, selected-customer assignments, usage tracking |
| `segments` | saved custom segments (JSON rules) |
| `message_templates` | editable message templates |
| `smart_actions` | one outreach list (run): type, message snapshot, channel |
| `customer_action_status` | per-customer outcome in a run (`not_contacted/prepared/contacted/replied/returned/not_interested/custom:*`) |
| `follow_ups` | planned contacts |
| `audit_log` | who/what changed (customers, points, redemptions, backups…) |
| `license_state` | stored license text and clock high-water mark (**never backed up**) |
| `schema_migrations` | applied migrations |

Balances are not cached: `SUM(points_ledger.delta)`. `LoyaltyService.reconcile()` cross-checks every purchase and redemption against the ledger (Loyalty → Points integrity check). Reversing a purchase marks it `reversed` and adds an offsetting ledger entry; if the customer already spent the points the balance may go negative until they earn more.
