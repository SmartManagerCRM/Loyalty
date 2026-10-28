import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "../i18n/en";
import { ar } from "../i18n/ar";
import { ACTION_TYPES, BUILT_IN_STATUSES } from "../domain/types";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "tests" ? [] : walk(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
const src = walk(join(__dirname, "..")).map((f) => readFileSync(f, "utf8")).join("\n");

describe("translations", () => {
  it("Arabic has exactly the same keys as English", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
  it("has no empty strings except intentionally blank banner keys", () => {
    for (const [k, v] of Object.entries(en)) if (!v && !k.startsWith("licenseBanner.active")) throw new Error(`empty en: ${k}`);
    for (const [k, v] of Object.entries(ar)) if (!v && !k.startsWith("licenseBanner.active")) throw new Error(`empty ar: ${k}`);
  });
  it("uses the same {placeholders} in both languages", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of Object.keys(en)) expect(ph(ar[k]!), k).toBe(ph(en[k]!));
  });
  it("contains every statically referenced key", () => {
    const used = new Set([...src.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]!));
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
  it("covers dynamic key families", () => {
    const need: string[] = [];
    for (const a of ACTION_TYPES) need.push(`action.${a}.title`, `action.${a}.desc`, `action.${a}.empty`);
    for (const s of BUILT_IN_STATUSES) need.push(`status.${s}`);
    for (const k of ["noPurchaseUsual", "noPurchaseDefault", "frequencyDown", "vipTier", "rewardReady", "rewardReadyFull", "lastContacted", "newNoReturn", "birthdayToday", "birthdaySoon", "segmentMatch", "followUpOverdue"]) need.push(`reason.${k}`);
    for (const k of ["addFirstCustomers", "followUpsDue", "retain_vip", "win_back", "prevent_churn", "points_reminder", "new_customer", "birthday", "backupNever", "backupOld"]) need.push(`rec.${k}.title`, `rec.${k}.text`);
    for (const k of ["unlicensed", "active", "expired", "not_yet_valid", "clock_anomaly", "invalid"]) need.push(`license.status.${k}`, `license.explain.${k}`, `licenseBanner.${k}.title`, `licenseBanner.${k}.text`);
    for (const k of ["not_a_backup", "unsupported_version", "newer_schema", "checksum_mismatch", "wrong_passphrase_or_corrupt", "invalid_structure"]) need.push(`backup.err.${k}`);
    for (const k of ["malformed", "unknown_format", "unsupported_schema", "unknown_key", "key_not_valid_for_issue_date", "bad_signature", "non_canonical", "missing_field", "wrong_product", "wrong_device"]) need.push(`err.license_${k}`);
    // every DomainError code thrown in repositories/services needs a message
    for (const m of src.matchAll(/new DomainError\(\s*"([a-z_]+)"/g)) need.push(`err.${m[1]}`);
    for (const m of src.matchAll(/errors\.push\("([a-z_]+)"\)/g)) need.push(`err.${m[1]}`);
    for (const m of src.matchAll(/return "([a-z_]+)"/g)) if (/err|invalid|needs|mismatch/.test(m[1]!)) void m;
    const missing = [...new Set(need)].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
});
