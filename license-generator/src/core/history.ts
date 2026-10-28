import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalize } from "@smloyalty/license-core";
import { DerivedState, GeneratorError, HistoryFilter, IssuedRecord } from "./types";

export const HISTORY_FILE = "license-history.json";
const FORMAT = "smloyalty-license-history";
const EXPIRING_DAYS = 30;

interface HistoryFile {
  format: typeof FORMAT;
  version: 1;
  records: IssuedRecord[];
}

export function derivedState(r: IssuedRecord, now: number): DerivedState {
  if (r.status === "superseded") return "superseded";
  if (Date.parse(r.validFrom) > now) return "not_started";
  if (r.expiresAt === null) return "active";
  const exp = Date.parse(r.expiresAt);
  if (now >= exp) return "expired";
  return exp - now <= EXPIRING_DAYS * 86_400_000 ? "expiring" : "active";
}

/** Local administrative record of issued licenses. A plain JSON file, written atomically; not a remote database. */
export class HistoryStore {
  constructor(private readonly dir: string) {}
  private get path() {
    return join(this.dir, HISTORY_FILE);
  }

  private load(): HistoryFile {
    if (!existsSync(this.path)) return { format: FORMAT, version: 1, records: [] };
    const f = JSON.parse(readFileSync(this.path, "utf8")) as HistoryFile;
    if (f.format !== FORMAT || f.version !== 1 || !Array.isArray(f.records)) throw new GeneratorError("history_invalid");
    return f;
  }

  private save(f: HistoryFile) {
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) copyFileSync(this.path, `${this.path}.bak`); // one-step safety copy
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(f, null, 2));
    renameSync(tmp, this.path);
  }

  all(): IssuedRecord[] {
    return this.load().records;
  }

  get(licenseId: string): IssuedRecord | undefined {
    return this.load().records.find((r) => r.licenseId === licenseId);
  }

  add(record: IssuedRecord) {
    const f = this.load();
    if (f.records.some((r) => r.licenseId === record.licenseId)) throw new GeneratorError("duplicate_license_id");
    f.records.push(record);
    this.save(f);
  }

  /** Record that a license was replaced by another one (device replacement). */
  markSuperseded(licenseId: string, by: string, reason: string) {
    const f = this.load();
    const r = f.records.find((x) => x.licenseId === licenseId);
    if (!r) throw new GeneratorError("not_found");
    r.status = "superseded";
    r.supersededBy = by;
    r.reissueReason = reason;
    this.save(f);
  }

  activeForDevice(fingerprint: string): IssuedRecord | undefined {
    return this.load().records.find((r) => r.deviceFingerprint === fingerprint && r.status === "active");
  }

  list(filter: HistoryFilter = {}, now = Date.now()): (IssuedRecord & { state: DerivedState })[] {
    const q = filter.query?.trim().toLowerCase();
    return this.load().records
      .map((r) => ({ ...r, state: derivedState(r, now) }))
      .filter((r) => (filter.type && filter.type !== "all" ? r.licenseType === filter.type : true))
      .filter((r) => {
        const s = filter.state ?? "all";
        if (s === "all") return true;
        if (s === "active") return r.state === "active" || r.state === "expiring" || r.state === "not_started";
        return r.state === s;
      })
      .filter((r) => !q || [r.customerReference, r.notes, r.deviceFingerprint, r.licenseId, r.fileName].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  summary(now = Date.now()) {
    const recs = this.load().records.map((r) => ({ r, s: derivedState(r, now) }));
    const n = (f: (x: (typeof recs)[number]) => boolean) => recs.filter(f).length;
    return {
      total: recs.length,
      activeLifetime: n((x) => x.r.licenseType === "lifetime" && x.s === "active"),
      activeCustom: n((x) => x.r.licenseType === "custom_duration" && (x.s === "active" || x.s === "expiring")),
      expiring: n((x) => x.s === "expiring"),
      expired: n((x) => x.s === "expired"),
      superseded: n((x) => x.s === "superseded"),
      expiringSoon: recs.filter((x) => x.s === "expiring").sort((a, b) => Date.parse(a.r.expiresAt!) - Date.parse(b.r.expiresAt!)).slice(0, 8).map((x) => x.r),
    };
  }

  // ───────── backup & restore of the history ─────────
  exportBackupText(now = new Date()): string {
    const records = this.load().records;
    const body = { exportedAt: now.toISOString(), count: records.length, records };
    return JSON.stringify({ format: "smloyalty-license-history-backup", version: 1, ...body, checksum: createHash("sha256").update(canonicalize(body)).digest("hex") }, null, 2) + "\n";
  }

  /** Validate a history backup and return what an import would do. Nothing is written. */
  previewImport(text: string): { added: IssuedRecord[]; identical: number; conflicts: string[] } {
    let b: { format?: string; version?: number; exportedAt?: string; count?: number; records?: IssuedRecord[]; checksum?: string };
    try { b = JSON.parse(text); } catch { throw new GeneratorError("backup_invalid"); }
    if (b.format !== "smloyalty-license-history-backup" || b.version !== 1 || !Array.isArray(b.records) || typeof b.checksum !== "string") throw new GeneratorError("backup_invalid");
    const body = { exportedAt: b.exportedAt, count: b.count, records: b.records };
    if (createHash("sha256").update(canonicalize(body)).digest("hex") !== b.checksum) throw new GeneratorError("backup_checksum");
    const mine = new Map(this.load().records.map((r) => [r.licenseId, r]));
    const added: IssuedRecord[] = [];
    const conflicts: string[] = [];
    let identical = 0;
    for (const r of b.records) {
      if (!r.licenseId || !r.fileText) throw new GeneratorError("backup_invalid");
      const cur = mine.get(r.licenseId);
      if (!cur) added.push(r);
      else if (cur.fileText === r.fileText) identical++;
      else conflicts.push(r.licenseId);
    }
    return { added, identical, conflicts };
  }

  /** Merge: never overwrites an existing record. */
  importBackup(text: string): { added: number; identical: number; conflicts: string[] } {
    const p = this.previewImport(text);
    if (p.added.length) {
      const f = this.load();
      f.records.push(...p.added);
      this.save(f);
    }
    return { added: p.added.length, identical: p.identical, conflicts: p.conflicts };
  }
}
