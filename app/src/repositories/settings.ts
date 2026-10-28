import type { AppContext } from "./context";
import type { Db } from "../database/db";
import { DEFAULT_SETTINGS, SettingsMap } from "../domain/settings";

export class SettingsRepo {
  private cache: SettingsMap | null = null;
  constructor(private readonly ctx: AppContext) {}

  /** Pass `db` (the transaction handle) when calling from inside a transaction to avoid waiting on the DB lock. */
  async all(db: Db = this.ctx.db): Promise<SettingsMap> {
    if (this.cache) return this.cache;
    const rows = await db.all<{ key: string; value: string }>("SELECT key, value FROM app_settings");
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (!(r.key in DEFAULT_SETTINGS)) continue;
      try {
        const parsed = JSON.parse(r.value) as unknown;
        const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[r.key];
        out[r.key] = def && typeof def === "object" && !Array.isArray(def) && parsed && typeof parsed === "object" ? { ...(def as object), ...(parsed as object) } : parsed;
      } catch {
        /* keep default */
      }
    }
    this.cache = out as unknown as SettingsMap;
    return this.cache;
  }

  async get<K extends keyof SettingsMap>(key: K, db: Db = this.ctx.db): Promise<SettingsMap[K]> {
    return (await this.all(db))[key];
  }

  async set<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
    this.ctx.assertWritable();
    await this.setUnguarded(key, value);
  }

  /** For internal bookkeeping that must work in read-only mode (e.g. last backup time). */
  async setUnguarded<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
    await this.ctx.db.run(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, JSON.stringify(value), this.ctx.now().toISOString()],
    );
    this.cache = null;
  }

  invalidate() {
    this.cache = null;
  }
}
