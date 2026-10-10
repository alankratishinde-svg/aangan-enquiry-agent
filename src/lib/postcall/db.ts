import type { PGlite } from "@electric-sql/pglite";
import type pg from "pg";

/** Minimal SQL port so the same store runs on Neon (pg) and on in-process Postgres in tests. */
export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Db extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export function pgDb(pool: pg.Pool): Db {
  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: (t, p) => client.query(t, p as unknown[]) as never });
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export function pgliteDb(db: PGlite): Db {
  return {
    query: (text, params) => db.query(text, params as unknown[]) as never,
    transaction: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p as unknown[]) as never })),
  };
}
