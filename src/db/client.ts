import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<PgQueryResultHKT & any, Schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

let instance: DB | undefined;

/**
 * Neon over WebSockets (not HTTP) so we get real interactive transactions,
 * which row-level security and the ledger need. Use the POOLED connection
 * string (host contains "-pooler") at runtime.
 */
export function getDb(): DB {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (isLocal(url)) {
    // Local Postgres (e.g. `docker compose up -d`): plain TCP driver.
    instance = drizzlePg({ client: new PgPool({ connectionString: url }), schema }) as unknown as DB;
    return instance;
  }
  if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url });
  instance = drizzle({ client: pool, schema }) as unknown as DB;
  return instance;
}

function isLocal(url: string) {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Tests inject a PGlite database here. */
export function setDbForTesting(db: DB | undefined) {
  instance = db;
}

export type RequestScope = {
  userId: string | null;
  orgId?: string | null;
  /** Only for platform jobs (cron) and audited platform-admin actions. */
  bypass?: boolean;
};

/**
 * Run work in one transaction with the row-level-security context set.
 * set_config(..., true) is transaction-local (SET LOCAL), so the values
 * never leak to another request sharing the pooled connection.
 * Every query on tenant-owned tables MUST go through this.
 */
export async function withScope<T>(scope: RequestScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.user_id', ${scope.userId ?? ""}, true),
      set_config('app.org_id', ${scope.orgId ?? ""}, true),
      set_config('app.bypass', ${scope.bypass ? "on" : ""}, true)`);
    return fn(tx);
  });
}
