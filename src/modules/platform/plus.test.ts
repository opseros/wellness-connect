import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { makeUser, setFeature } from "@/test/factories";
import type { DB } from "@/db/client";
import { user } from "@/db/schema";
import { joinPlusWaitlist, leavePlusWaitlist, plusFor, plusWaitlistCount } from "./plus";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let member: { id: string }, boss: { id: string };

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  member = await makeUser(db);
  boss = await makeUser(db);
  await db.update(user).set({ platformRole: "super_admin", twoFactorEnabled: true }).where(eq(user.id, boss.id));
});
afterAll(() => t.close());

describe("Moosam Plus switch", () => {
  it("is hidden from members while off; super admins can preview it", async () => {
    expect(await plusFor(member.id)).toBeNull();
    await expect(joinPlusWaitlist(member.id)).rejects.toMatchObject({ status: 404 });
    expect(await plusFor(boss.id)).toMatchObject({ preview: true, pricePaise: 29900 });
  });

  it("when switched on, members can join and leave the waitlist", async () => {
    await setFeature(db, "plus", true);
    expect(await plusFor(member.id)).toMatchObject({ preview: false, joined: false });
    await joinPlusWaitlist(member.id);
    await joinPlusWaitlist(member.id);
    expect(await plusFor(member.id)).toMatchObject({ joined: true });
    expect(await plusWaitlistCount()).toBe(1);
    await leavePlusWaitlist(member.id);
    expect(await plusWaitlistCount()).toBe(0);
  });
});
