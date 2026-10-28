import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { RawExecutor, SerialDb, SqlParams } from "./db";

const DB_NAME = "smartmanager_loyalty";

class CapRaw implements RawExecutor {
  constructor(private readonly conn: SQLiteDBConnection) {}
  async rawRun(sql: string, params: SqlParams) {
    const res = await this.conn.run(sql, params, false, "no");
    return res.changes?.changes ?? 0;
  }
  async rawAll(sql: string, params: SqlParams) {
    const res = await this.conn.query(sql, params);
    return (res.values ?? []) as Record<string, unknown>[];
  }
  async begin() {
    await this.conn.beginTransaction();
  }
  async commit() {
    await this.conn.commitTransaction();
  }
  async rollback() {
    await this.conn.rollbackTransaction();
  }
}

/** Open the native (Android/iOS) SQLite database through @capacitor-community/sqlite. */
export async function openCapacitorDb(): Promise<SerialDb> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  const conn: SQLiteDBConnection =
    consistent && isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await conn.open();
  await conn.execute("PRAGMA foreign_keys = ON;", false);
  return new SerialDb(new CapRaw(conn));
}
