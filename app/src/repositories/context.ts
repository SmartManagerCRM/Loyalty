import type { Db } from "../database/db";
import { DomainError } from "../database/db";
import { nowIso, uuid } from "../domain/ids";

export interface AppContext {
  db: Db;
  /** Throws DomainError("license_restricted") when the license does not allow writes. */
  assertWritable(): void;
  now(): Date;
}

export function makeContext(db: Db, opts: Partial<Pick<AppContext, "assertWritable" | "now">> = {}): AppContext {
  return { db, assertWritable: opts.assertWritable ?? (() => undefined), now: opts.now ?? (() => new Date()) };
}

export async function audit(tx: Db, ctx: AppContext, entity: string, entityId: string | null, action: string, details?: Record<string, unknown>) {
  await tx.run("INSERT INTO audit_log (id, at, entity, entity_id, action, details) VALUES (?,?,?,?,?,?)", [
    uuid(), ctx.now().toISOString(), entity, entityId, action, details ? JSON.stringify(details) : null,
  ]);
}

export function requireText(v: string | null | undefined, code: string, max = 200): string {
  const t = (v ?? "").trim();
  if (!t) throw new DomainError(code);
  return t.slice(0, max);
}

export function requireInt(v: number, code: string, min = 0): number {
  if (!Number.isInteger(v) || v < min) throw new DomainError(code);
  return v;
}

export { nowIso, uuid };
