import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { RawExecutor, SerialDb, SqlParams } from "./db";

export interface SqlJsPersistence {
  load(): Promise<Uint8Array | null>;
  save(data: Uint8Array): Promise<void>;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
export function loadSqlJs(wasmUrl?: string): Promise<SqlJsStatic> {
  sqlJsPromise ??= initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  return sqlJsPromise;
}

class SqlJsRaw implements RawExecutor {
  constructor(readonly sdb: Database) {}
  async rawRun(sql: string, params: SqlParams) {
    this.sdb.run(sql, params);
    return this.sdb.getRowsModified();
  }
  async rawAll(sql: string, params: SqlParams) {
    const stmt = this.sdb.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
  async begin() {
    this.sdb.run("BEGIN");
  }
  async commit() {
    this.sdb.run("COMMIT");
  }
  async rollback() {
    this.sdb.run("ROLLBACK");
  }
}

export interface OpenedSqlJs {
  db: SerialDb;
  export(): Uint8Array;
}

/** Open an in-memory sql.js database, optionally persisted by the supplied adapter (browser preview). */
export async function openSqlJsDb(opts: { wasmUrl?: string; persistence?: SqlJsPersistence } = {}): Promise<OpenedSqlJs> {
  const SQL = await loadSqlJs(opts.wasmUrl);
  const existing = opts.persistence ? await opts.persistence.load() : null;
  const sdb = existing ? new SQL.Database(existing) : new SQL.Database();
  sdb.run("PRAGMA foreign_keys = ON");
  const raw = new SqlJsRaw(sdb);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedulePersist = () => {
    if (!opts.persistence) return;
    clearTimeout(timer);
    timer = setTimeout(() => void opts.persistence!.save(sdb.export()), 300);
  };
  return { db: new SerialDb(raw, schedulePersist), export: () => sdb.export() };
}

/** IndexedDB persistence for browser preview builds only. */
export function indexedDbPersistence(name = "smloyalty-preview"): SqlJsPersistence {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("db");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    async load() {
      const idb = await open();
      return new Promise((resolve, reject) => {
        const r = idb.transaction("db").objectStore("db").get("main");
        r.onsuccess = () => resolve((r.result as Uint8Array | undefined) ?? null);
        r.onerror = () => reject(r.error);
      });
    },
    async save(data) {
      const idb = await open();
      await new Promise<void>((resolve, reject) => {
        const t = idb.transaction("db", "readwrite");
        t.objectStore("db").put(data, "main");
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
  };
}
