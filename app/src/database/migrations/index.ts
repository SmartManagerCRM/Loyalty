import type { Db } from "../db";
import { m001 } from "./001_initial";
import { m002 } from "./002_return_interval";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [m001, m002];
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter((s) => s.length > 0);
}

/** Apply pending migrations; each runs in its own transaction and is recorded. */
export async function migrate(db: Db): Promise<number> {
  await db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const row = await db.get<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  const current = row?.v ?? 0;
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(`Database schema v${current} is newer than this app supports (v${LATEST_SCHEMA_VERSION}). Update the app.`);
  }
  for (const m of MIGRATIONS.filter((x) => x.version > current)) {
    await db.transaction(async (tx) => {
      for (const stmt of statements(m.sql)) await tx.run(stmt);
      await tx.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [m.version, m.name, new Date().toISOString()]);
    });
  }
  return LATEST_SCHEMA_VERSION;
}
