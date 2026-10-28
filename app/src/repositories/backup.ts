import { DomainError } from "../database/db";
import type { Db } from "../database/db";
import type { AppContext } from "./context";
import { audit } from "./context";
import type { SettingsRepo } from "./settings";
import { LATEST_SCHEMA_VERSION } from "../database/migrations";
import { canonicalize, bytesToHex, utf8ToBytes } from "@smloyalty/license-core";
import { sha256 } from "@noble/hashes/sha256";
import { decryptBackup, encryptBackup, EncryptedBackupFile } from "../domain/backupCrypto";

export const BACKUP_FORMAT = "smloyalty-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = "1.0.0";

/** Business-data tables in parent-before-child order. license_state and schema_migrations are deliberately excluded. */
export const BACKUP_TABLES = [
  "app_settings", "customers", "tags", "customer_tags", "rewards", "vip_tiers", "segments", "offers", "customer_offers", "message_templates",
  "transactions", "points_ledger", "reward_redemptions", "offer_redemptions", "smart_actions", "customer_action_status", "follow_ups", "audit_log",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

type Row = Record<string, string | number | null>;
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  data: Record<string, Row[]>;
  checksum: string;
}

export interface BackupInspection {
  encrypted: boolean;
  needsPassphrase: boolean;
  backup?: BackupFile;
  error?: "not_a_backup" | "unsupported_version" | "newer_schema" | "checksum_mismatch" | "wrong_passphrase_or_corrupt" | "invalid_structure";
}

const checksumOf = (counts: unknown, data: unknown) => bytesToHex(sha256(utf8ToBytes(canonicalize({ counts, data }))));

/** Upgrade hooks for older backup formats. Add a step when the format changes. */
function upgradeBackup(b: BackupFile): BackupFile {
  return b; // only v1 exists
}

export class BackupService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo) {}

  async create(): Promise<BackupFile> {
    const data: Record<string, Row[]> = {};
    const counts: Record<string, number> = {};
    // one read transaction keeps the snapshot consistent
    await this.ctx.db.transaction(async (tx) => {
      for (const t of BACKUP_TABLES) {
        data[t] = await tx.all<Row>(`SELECT * FROM ${t} ORDER BY rowid`);
        counts[t] = data[t]!.length;
      }
    });
    return {
      format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION, schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: this.ctx.now().toISOString(), counts, data, checksum: checksumOf(counts, data),
    };
  }

  /** Serialize (optionally encrypted) and record the backup time. */
  async export(passphrase?: string): Promise<{ text: string; filename: string; encrypted: boolean; backup: BackupFile }> {
    const backup = await this.create();
    const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const plain = JSON.stringify(backup);
    let text = plain;
    if (passphrase) {
      if (passphrase.length < 8) throw new DomainError("passphrase_short");
      text = JSON.stringify(await encryptBackup(plain, passphrase, { appVersion: backup.appVersion, exportedAt: backup.exportedAt }));
    }
    await this.settings.setUnguarded("lastBackupAt", backup.exportedAt);
    return { text, filename: `smartmanager-loyalty-${stamp}.smloyaltybackup`, encrypted: !!passphrase, backup };
  }

  async inspect(text: string, passphrase?: string): Promise<BackupInspection> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { encrypted: false, needsPassphrase: false, error: "not_a_backup" };
    }
    const obj = parsed as { format?: string } & Record<string, unknown>;
    if (obj?.format === "smloyalty-backup-encrypted") {
      if (!passphrase) return { encrypted: true, needsPassphrase: true };
      try {
        const inner = await decryptBackup(obj as unknown as EncryptedBackupFile, passphrase);
        const r = this.validate(JSON.parse(inner));
        return { encrypted: true, needsPassphrase: false, ...r };
      } catch (e) {
        return { encrypted: true, needsPassphrase: true, error: e instanceof Error && e.message === "wrong_passphrase_or_corrupt" ? "wrong_passphrase_or_corrupt" : "invalid_structure" };
      }
    }
    if (obj?.format !== BACKUP_FORMAT) return { encrypted: false, needsPassphrase: false, error: "not_a_backup" };
    return { encrypted: false, needsPassphrase: false, ...this.validate(obj) };
  }

  private validate(raw: unknown): { backup?: BackupFile; error?: BackupInspection["error"] } {
    const b = raw as BackupFile;
    if (!b || (b.format as string) !== BACKUP_FORMAT) return { error: "not_a_backup" };
    if (!Number.isInteger(b.formatVersion) || b.formatVersion < 1 || b.formatVersion > BACKUP_FORMAT_VERSION) return { error: "unsupported_version" };
    if (!Number.isInteger(b.schemaVersion) || b.schemaVersion > LATEST_SCHEMA_VERSION) return { error: "newer_schema" };
    if (!b.data || typeof b.data !== "object" || !b.counts || typeof b.checksum !== "string") return { error: "invalid_structure" };
    for (const t of BACKUP_TABLES) {
      if (!Array.isArray(b.data[t]) || b.counts[t] !== b.data[t]!.length) return { error: "invalid_structure" };
    }
    if (Object.keys(b.data).some((k) => !(BACKUP_TABLES as readonly string[]).includes(k))) return { error: "invalid_structure" };
    try {
      if (checksumOf(b.counts, b.data) !== b.checksum) return { error: "checksum_mismatch" };
    } catch {
      return { error: "invalid_structure" };
    }
    return { backup: upgradeBackup(b) };
  }

  /**
   * Replace all business data with the backup, atomically. Any failure (bad row, constraint, FK violation, count mismatch)
   * rolls the whole transaction back and leaves existing data untouched. License state is never touched.
   */
  async restore(backup: BackupFile): Promise<{ counts: Record<string, number> }> {
    const valid = this.validate(backup);
    if (!valid.backup) throw new DomainError(valid.error ?? "invalid_structure");
    const b = valid.backup;
    await this.ctx.db.transaction(async (tx) => {
      await this.wipe(tx);
      for (const t of BACKUP_TABLES) await this.insertRows(tx, t, b.data[t]!);
      const bad = await tx.all("PRAGMA foreign_key_check");
      if (bad.length) throw new DomainError("integrity_failed");
      for (const t of BACKUP_TABLES) {
        const n = (await tx.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))!.n;
        if (Number(n) !== b.counts[t]) throw new DomainError("integrity_failed");
      }
      await audit(tx, this.ctx, "backup", null, "restore", { exportedAt: b.exportedAt, counts: b.counts });
    });
    this.settings.invalidate();
    return { counts: b.counts };
  }

  private async tableColumns(tx: Db, table: string): Promise<string[]> {
    return (await tx.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
  }

  private async insertRows(tx: Db, table: BackupTable, rows: Row[]) {
    if (!rows.length) return;
    const cols = await this.tableColumns(tx, table);
    const colSet = new Set(cols);
    for (const r of rows) {
      for (const k of Object.keys(r)) if (!colSet.has(k)) throw new DomainError("invalid_structure");
    }
    // multi-row INSERTs keep restores fast on the native bridge
    const per = Math.max(1, Math.floor(900 / cols.length));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      const placeholders = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
      const params = chunk.flatMap((r) => cols.map((c) => (r[c] === undefined ? null : (r[c] as string | number | null))));
      await tx.run(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders}`, params);
    }
  }

  private async wipe(tx: Db) {
    for (const t of [...BACKUP_TABLES].reverse()) {
      if (t === "points_ledger") await tx.run("UPDATE points_ledger SET reverses_entry_id = NULL");
      await tx.run(`DELETE FROM ${t}`);
    }
  }

  /** Privacy control: remove all business data (the license stays). */
  async wipeAll(): Promise<void> {
    await this.ctx.db.transaction(async (tx) => {
      await this.wipe(tx);
    });
    this.settings.invalidate();
  }
}
