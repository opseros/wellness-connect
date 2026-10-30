import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/db/schema";
import { setDbForTesting, type DB } from "@/db/client";
import { resetAuthForTesting } from "@/lib/auth";
import { sentEmails } from "@/lib/email";

/**
 * Fresh in-memory Postgres with all migrations applied. After migrating we
 * switch to a NON-superuser role, because superusers bypass row-level
 * security; this mirrors Neon, where the app role is the (forced) owner.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  await client.exec(`
    create role app_user nosuperuser nobypassrls;
    grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    grant usage, select on all sequences in schema public to app_user;
    set role app_user;
  `);
  setDbForTesting(db as unknown as DB);
  resetAuthForTesting();
  sentEmails.length = 0;
  return {
    db: db as unknown as DB,
    client,
    close: async () => {
      setDbForTesting(undefined);
      resetAuthForTesting();
      await client.close();
    },
  };
}
