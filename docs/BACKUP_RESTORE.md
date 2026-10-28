# Backup and restore (business data)

More → Backup & restore. File: `smartmanager-loyalty-<timestamp>.smloyaltybackup`.

* Content: all business tables (settings, customers, tags, purchases, points ledger, rewards, redemptions, VIP tiers, offers, templates, outreach runs/statuses, follow-ups, audit log), `appVersion`, `schemaVersion`, `formatVersion`, `exportedAt`, per-table `counts`, SHA-256 **checksum** over the canonical data.
* **Never included**: license, device identity, the generator's private key. Restoring on another phone does not activate it.
* Encryption (recommended): PBKDF2-SHA256 (600 000 iterations) → AES-256-GCM, header authenticated. **A lost passphrase cannot be recovered.** An unencrypted option exists with a warning.
* Sharing: written to the app cache and handed to the system share sheet (Drive, Files, WhatsApp, email…). Android cloud/device-transfer backup is disabled on purpose.
* Restore: pick file → (passphrase) → validation (format, version, schema not newer, structure, counts, checksum) → preview with counts → type `RESTORE` → one SQL transaction: wipe + insert + `foreign_key_check` + count verification. **Any failure rolls back and leaves current data untouched**; an interrupted restore (app killed) is rolled back by SQLite. Restore is allowed even when the license is expired (read-only mode) because it only recovers the owner's data.
* Older formats: `upgradeBackup()` in `repositories/backup.ts` is the hook (only v1 exists).
* Tested: corrupted/truncated/tampered files, wrong passphrase, unknown column, FK violation (atomic), 1 500-customer dataset round-trip.
