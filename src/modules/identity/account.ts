import { and, desc, eq, gt, ne } from "drizzle-orm";
import { account, session } from "@/db/schema";
import { getDb } from "@/db/client";
import { notFound } from "@/lib/errors";

/** The signed-in user's active sessions. Tokens never leave the server. */
export async function listMySessions(userId: string) {
  return getDb()
    .select({ id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt));
}

export async function revokeMySession(userId: string, sessionId: string) {
  const rows = await getDb().delete(session).where(and(eq(session.id, sessionId), eq(session.userId, userId))).returning({ id: session.id });
  if (!rows.length) throw notFound("Session not found");
}

export async function revokeMyOtherSessions(userId: string, currentSessionId: string) {
  await getDb().delete(session).where(and(eq(session.userId, userId), ne(session.id, currentSessionId)));
}

export async function listMySignInMethods(userId: string) {
  const rows = await getDb().select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, userId));
  return rows;
}
