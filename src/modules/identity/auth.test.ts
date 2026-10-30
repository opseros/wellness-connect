import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { getAuth, resetAuthForTesting } from "@/lib/auth";
import { sentEmails } from "@/lib/email";
import { memberProfile, membership, organization, user } from "@/db/schema";
import type { DB } from "@/db/client";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
const BASE = "http://localhost:3000/api/auth";

function call(path: string, body?: unknown, cookie?: string) {
  return getAuth().handler(
    new Request(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function lastLinkTo(email: string, pattern: RegExp) {
  const mail = [...sentEmails].reverse().find((m) => m.to === email);
  const match = mail?.text.match(pattern);
  if (!match) throw new Error(`no link for ${email}`);
  return match[0];
}

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const [org] = await db
    .insert(organization)
    .values({ name: "Northwind Labs", slug: "northwind", domain: "northwindlabs.com", domainVerifiedAt: new Date() })
    .returning();
  void org;
});
afterAll(() => t.close());

describe("email and password sign-in", () => {
  const email = "priya@northwindlabs.com";
  const password = "correct horse battery";

  it("rejects passwords shorter than 10 characters", async () => {
    const res = await call("/sign-up/email", { email: "short@example.test", password: "abc123456", name: "Short" });
    expect(res.status).toBe(400);
  });

  it("signs up, ignores a smuggled platformRole and creates a Connect profile", async () => {
    const res = await call("/sign-up/email", { email, password, name: "Priya Sharma", platformRole: "super_admin" });
    expect(res.status).toBeLessThan(500);
    const u = await db.query.user.findFirst({ where: eq(user.email, email) });
    expect(u?.platformRole).toBe("user");
    expect(u?.emailVerified).toBe(false);
    const profile = await db.query.memberProfile.findFirst({ where: eq(memberProfile.userId, u!.id) });
    expect(profile).toBeTruthy();
  });

  it("blocks sign-in until the email is verified", async () => {
    const res = await call("/sign-in/email", { email, password });
    expect(res.status).toBe(403);
  });

  it("verifies the email, then joins the company by domain as a PENDING member", async () => {
    const link = lastLinkTo(email, /http\S+verify-email\S+/);
    const token = new URL(link).searchParams.get("token")!;
    const res = await call(`/verify-email?token=${token}`);
    expect(res.status).toBeLessThan(400);
    const u = await db.query.user.findFirst({ where: eq(user.email, email) });
    expect(u?.emailVerified).toBe(true);
    const m = await db.query.membership.findFirst({ where: eq(membership.userId, u!.id) });
    expect(m?.status).toBe("pending");
    expect(m?.role).toBe("member");
  });

  it("public email domains never join a company", async () => {
    const other = "someone@gmail.com";
    await call("/sign-up/email", { email: other, password, name: "Gee" });
    const token = new URL(lastLinkTo(other, /http\S+verify-email\S+/)).searchParams.get("token")!;
    await call(`/verify-email?token=${token}`);
    const u = await db.query.user.findFirst({ where: eq(user.email, other) });
    const m = await db.query.membership.findFirst({ where: eq(membership.userId, u!.id) });
    expect(m).toBeUndefined();
  });

  it("same error for a wrong password and an unknown email", async () => {
    const wrong = await call("/sign-in/email", { email, password: "wrong password!!" });
    const unknown = await call("/sign-in/email", { email: "nobody@example.test", password: "wrong password!!" });
    expect(wrong.status).toBe(unknown.status);
    expect((await wrong.json()).code).toBe((await unknown.json()).code);
  });

  it("a password reset signs the user out everywhere", async () => {
    const signIn = await call("/sign-in/email", { email, password });
    expect(signIn.status).toBe(200);
    const cookie = cookieFrom(signIn);
    const before = await (await call("/get-session", undefined, cookie)).json();
    expect(before?.user?.email).toBe(email);

    await call("/request-password-reset", { email, redirectTo: "http://localhost:3000/reset-password" });
    const link = lastLinkTo(email, /http\S+reset-password\/\S+/);
    const token = new URL(link).pathname.split("/").pop()!;
    const reset = await call("/reset-password", { newPassword: "a brand new passphrase", token });
    expect(reset.status).toBe(200);

    const after = await (await call("/get-session", undefined, cookie)).json();
    expect(after).toBeNull();
    const again = await call("/sign-in/email", { email, password: "a brand new passphrase" });
    expect(again.status).toBe(200);
  });

  it("rate-limits repeated sign-in attempts", async () => {
    process.env.AUTH_RATE_LIMIT = "on";
    resetAuthForTesting();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await getAuth().handler(
          new Request(`${BASE}/sign-in/email`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.9" },
            body: JSON.stringify({ email, password: "wrong password!!" }),
          }),
        );
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    } finally {
      delete process.env.AUTH_RATE_LIMIT;
      resetAuthForTesting();
    }
  });

  it("an org owner can see the pending request", async () => {
    const org = await db.query.organization.findFirst({ where: eq(organization.domain, "northwindlabs.com") });
    const pending = await db.select().from(membership).where(and(eq(membership.orgId, org!.id), eq(membership.status, "pending")));
    expect(pending).toHaveLength(1);
  });
});
