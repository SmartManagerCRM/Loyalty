import { Capacitor } from "@capacitor/core";
import type { Db } from "../database/db";
import { migrate } from "../database/migrations";
import { createServices, Services } from "../repositories";
import { LicenseManager } from "../services/licensing";
import { createSecureKV } from "../services/secureStorage";
import type { SettingsMap } from "../domain/settings";

export interface Booted {
  svc: Services;
  license: LicenseManager;
  settings: SettingsMap;
  platform: "android" | "ios" | "web";
}

async function openDb(): Promise<Db> {
  if (Capacitor.isNativePlatform()) {
    const { openCapacitorDb } = await import("../database/capacitorSqlite");
    return openCapacitorDb();
  }
  // Browser preview (development / automated UI checks). The shipped Android and iOS apps always use native SQLite.
  const [{ openSqlJsDb, indexedDbPersistence }, wasm] = await Promise.all([import("../database/sqljs"), import("sql.js/dist/sql-wasm.wasm?url")]);
  const noPersist = new URLSearchParams(location.search).has("memory");
  return (await openSqlJsDb({ wasmUrl: wasm.default, persistence: noPersist ? undefined : indexedDbPersistence() })).db;
}

export async function boot(): Promise<Booted> {
  const db = await openDb();
  await migrate(db);
  const kv = await createSecureKV();
  const platform = Capacitor.getPlatform() as Booted["platform"];
  const license = new LicenseManager(db, kv, __TRUSTED_KEYS__, { appVersion: __APP_VERSION__, platform });
  await license.init();
  const svc = await createServices(db, { assertWritable: () => license.assertWritable() });
  const settings = await svc.settings.all();
  return { svc, license, settings, platform };
}
