import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { categoryBySlug, makeProfessional, makeUser } from "@/test/factories";
import type { DB } from "@/db/client";
import { auditLog, credential, organization, post, professionalProfile, report, session, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { sentEmails } from "@/lib/email";
import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";
import { onSessionCreated, promoteBootstrapSuperAdmin } from "@/modules/identity/hooks";
import {
  decideCredential,
  listAuditLog,
  listCredentialQueue,
  resolveReport,
  setOrganizationDomain,
  setPlatformRole,
  suspendUser,
  unsuspendUser,
  type StaffActor,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let boss: StaffActor, ops: StaffActor, opsNo2fa: StaffActor, regular: StaffActor;

const actor = (u: { id: string }, role: StaffActor["platformRole"], twoFactorEnabled = true): StaffActor => ({ id: u.id, platformRole: role, twoFactorEnabled });

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  boss = actor(await makeUser(db, "boss@opseros.com"), "super_admin");
  ops = actor(await makeUser(db, "ops@opseros.com"), "ops");
  opsNo2fa = actor(await makeUser(db), "ops", false);
  regular = actor(await makeUser(db), "user");
});
afterAll(() => t.close());

describe("admin permissions", () => {
  it("staff without two-factor and regular users are refused", async () => {
    await expect(listCredentialQueue(opsNo2fa)).rejects.toMatchObject({ status: 403 });
    await expect(listCredentialQueue(regular)).rejects.toMatchObject({ status: 403 });
    await expect(listCredentialQueue(ops)).resolves.toEqual([]);
  });

  it("only super admins change roles; ops can't, nobody changes themselves", async () => {
    const target = await makeUser(db);
    await expect(setPlatformRole(ops, target.id, { role: "ops" })).rejects.toMatchObject({ status: 403 });
    await expect(setPlatformRole(boss, boss.id, { role: "user" })).rejects.toMatchObject({ status: 400 });
    await setPlatformRole(boss, target.id, { role: "ops" });
    expect((await db.query.user.findFirst({ where: eq(user.id, target.id) }))?.platformRole).toBe("ops");
  });

  it("SUPER_ADMIN_EMAILS promotes only listed, verified addresses", async () => {
    process.env.SUPER_ADMIN_EMAILS = "founder@opseros.com";
    try {
      const founder = await makeUser(db, "Founder@opseros.com");
      const other = await makeUser(db, "someone@opseros.com");
      await promoteBootstrapSuperAdmin(founder);
      await promoteBootstrapSuperAdmin(other);
      expect((await db.query.user.findFirst({ where: eq(user.id, founder.id) }))?.platformRole).toBe("super_admin");
      expect((await db.query.user.findFirst({ where: eq(user.id, other.id) }))?.platformRole).toBe("user");
      // An account verified BEFORE being listed is promoted at its next sign-in.
      process.env.SUPER_ADMIN_EMAILS = "founder@opseros.com,early@opseros.com";
      const early = await makeUser(db, "early@opseros.com");
      await onSessionCreated(early.id);
      expect((await db.query.user.findFirst({ where: eq(user.id, early.id) }))?.platformRole).toBe("super_admin");
    } finally {
      delete process.env.SUPER_ADMIN_EMAILS;
    }
  });
});

describe("credential verification", () => {
  it("approving verifies the profile, emails the professional and is audited", async () => {
    const cat = await categoryBySlug(db, "yoga-mindfulness");
    const pro = await makeProfessional(db, { categoryId: cat.id, verified: false });
    const [queued] = await listCredentialQueue(ops);
    expect(queued.professionalEmail).toBe(pro.user.email);

    await expect(decideCredential(ops, queued.id, { decision: "rejected" })).rejects.toMatchObject({ status: 400 }); // note required
    await decideCredential(ops, queued.id, { decision: "approved" });

    const profile = await db.query.professionalProfile.findFirst({ where: eq(professionalProfile.id, pro.profile.id) });
    expect(profile?.verificationStatus).toBe("verified");
    expect((await db.query.credential.findFirst({ where: eq(credential.id, queued.id) }))?.reviewedBy).toBe(ops.id);
    await processOutbox();
    expect(sentEmails.some((e) => e.to === pro.user.email && e.subject === "Update on your credential review")).toBe(true);
    const log = await listAuditLog(ops, { action: "credential.approved" });
    expect(log[0]?.actorEmail).toBe("ops@opseros.com");
  });
});

describe("suspension", () => {
  it("deletes sessions and blocks every new sign-in", async () => {
    const email = "spammer@example.test";
    await db.insert(user).values({ name: "Spammer", email, emailVerified: true });
    // Give them a password account through Better Auth so we can try to sign in.
    const target = (await db.query.user.findFirst({ where: eq(user.email, email) }))!;
    const ctx = await getAuth().$context;
    await ctx.internalAdapter.linkAccount({ userId: target.id, providerId: "credential", accountId: target.id, password: await ctx.password.hash("correct horse battery") });
    const signIn = () =>
      getAuth().handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ email, password: "correct horse battery" }),
        }),
      );
    expect((await signIn()).status).toBe(200);

    await expect(suspendUser(ops, target.id, { reason: "Spam posts" })).rejects.toMatchObject({ status: 403 });
    await expect(suspendUser(boss, target.id, { reason: "no" })).rejects.toThrow();
    await suspendUser(boss, target.id, { reason: "Repeated spam posts" });
    expect(await db.select().from(session).where(eq(session.userId, target.id))).toHaveLength(0);
    expect((await signIn()).status).toBe(403);

    await unsuspendUser(boss, target.id);
    expect((await signIn()).status).toBe(200);
  });

  it("super admins can't be suspended", async () => {
    const other = await makeUser(db);
    await db.update(user).set({ platformRole: "super_admin" }).where(eq(user.id, other.id));
    await expect(suspendUser(boss, other.id, { reason: "testing it" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("organizations and moderation", () => {
  it("links a company domain but refuses public mail domains and duplicates", async () => {
    const [a] = await db.insert(organization).values({ name: "Acme", slug: "acme" }).returning();
    const [b] = await db.insert(organization).values({ name: "Beta", slug: "beta" }).returning();
    await expect(setOrganizationDomain(boss, a.id, { domain: "gmail.com" })).rejects.toMatchObject({ status: 400 });
    await expect(setOrganizationDomain(ops, a.id, { domain: "acme.in" })).rejects.toMatchObject({ status: 403 });
    const row = await setOrganizationDomain(boss, a.id, { domain: "@Acme.in" });
    expect(row.domain).toBe("acme.in");
    expect(row.domainVerifiedAt).toBeTruthy();
    await expect(setOrganizationDomain(boss, b.id, { domain: "acme.in" })).rejects.toMatchObject({ status: 400 });
  });

  it("removing reported content hides the post and closes the report", async () => {
    const author = await makeUser(db);
    const reporter = await makeUser(db);
    const [p] = await db.insert(post).values({ authorId: author.id, body: "spam spam" }).returning();
    const [r] = await db.insert(report).values({ reporterId: reporter.id, targetType: "post", targetId: p.id, reason: "Spam" }).returning();
    await resolveReport(ops, r.id, { action: "remove_content" });
    expect((await db.query.post.findFirst({ where: eq(post.id, p.id) }))?.deletedAt).toBeTruthy();
    expect((await db.query.report.findFirst({ where: eq(report.id, r.id) }))?.status).toBe("actioned");
    await expect(resolveReport(ops, r.id, { action: "dismiss" })).rejects.toMatchObject({ status: 404 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.action, "report.remove_content"));
    expect(audited).toHaveLength(1);
  });
});
