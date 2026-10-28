/**
 * Minimal async SQL interface. Two adapters implement it:
 *  - CapacitorSqliteDb (native Android/iOS SQLite)
 *  - SqlJsDb (WebAssembly SQLite: unit/integration tests and browser preview)
 * Repositories only depend on this interface.
 */
export type SqlValue = string | number | null;
export type SqlParams = SqlValue[];

export interface Db {
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T | undefined>;
  /** Run several statements atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Low-level executor an adapter must provide. */
export interface RawExecutor {
  rawRun(sql: string, params: SqlParams): Promise<number>;
  rawAll(sql: string, params: SqlParams): Promise<Record<string, unknown>[]>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Wraps a RawExecutor with a mutex so transactions never interleave with other
 * callers' statements (the native bridge is asynchronous).
 */
export class SerialDb implements Db {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(protected readonly raw: RawExecutor, private readonly afterCommit?: () => void) {}

  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }

  run(sql: string, params: SqlParams = []) {
    return this.lock(async () => {
      const changes = await this.raw.rawRun(sql, params);
      this.afterCommit?.();
      return { changes };
    });
  }
  all<T>(sql: string, params: SqlParams = []) {
    return this.lock(() => this.raw.rawAll(sql, params) as Promise<T[]>);
  }
  async get<T>(sql: string, params: SqlParams = []) {
    return (await this.all<T>(sql, params))[0];
  }
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.lock(async () => {
      await this.raw.begin();
      const tx = new TxDb(this.raw);
      try {
        const result = await fn(tx);
        await this.raw.commit();
        this.afterCommit?.();
        return result;
      } catch (e) {
        try {
          await this.raw.rollback();
        } catch {
          /* already rolled back */
        }
        throw e;
      }
    });
  }
}

class TxDb implements Db {
  constructor(private readonly raw: RawExecutor) {}
  async run(sql: string, params: SqlParams = []) {
    return { changes: await this.raw.rawRun(sql, params) };
  }
  all<T>(sql: string, params: SqlParams = []) {
    return this.raw.rawAll(sql, params) as Promise<T[]>;
  }
  async get<T>(sql: string, params: SqlParams = []) {
    return (await this.all<T>(sql, params))[0];
  }
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return fn(this); // join the outer transaction
  }
}

export class DomainError extends Error {
  constructor(public readonly code: string, message?: string, public readonly params?: Record<string, string | number>) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
