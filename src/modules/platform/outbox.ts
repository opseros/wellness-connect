import { sql, eq } from "drizzle-orm";
import { after } from "next/server";
import { outbox, auditLog } from "@/db/schema";
import type { Executor, Tx } from "@/db/client";
import { withScope } from "@/db/client";

export type OutboxEvent =
  | { type: "membership.requested"; payload: { orgId: string; userId: string; email: string } }
  | { type: "enquiry.sent"; payload: { enquiryId: string; requirementId: string; professionalUserId: string } }
  | { type: "booking.created"; payload: { bookingId: string; orgId: string; professionalUserId: string } }
  | { type: "connection.requested"; payload: { connectionId: string; fromUserId: string; toUserId: string } }
  | { type: "credential.reviewed"; payload: { credentialId: string; decision: string } };

/**
 * Call inside the same transaction as the business change. Delivery starts
 * right after the response is sent (Next.js `after`, which runs once the
 * transaction has committed); the scheduled cron only retries failures.
 */
export async function enqueue(tx: Executor, event: OutboxEvent) {
  await tx.insert(outbox).values({ type: event.type, payload: event.payload });
  scheduleDelivery();
}

// Several calls in one request are harmless: rows are claimed with SKIP LOCKED.
function scheduleDelivery() {
  try {
    after(async () => {
      await import("./handlers");
      await processOutbox();
    });
  } catch {
    // Outside a request (tests, scripts): the cron or an explicit processOutbox() call delivers.
  }
}

export async function audit(
  tx: Executor,
  entry: { actorId: string | null; action: string; targetType: string; targetId: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(auditLog).values({ ...entry, metadata: entry.metadata ?? {} });
}

type Handler = (tx: Tx, payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, Handler>();

export function registerOutboxHandler(type: OutboxEvent["type"], handler: Handler) {
  handlers.set(type, handler);
}

/**
 * Deliver due events. Safe to run concurrently: rows are claimed with
 * FOR UPDATE SKIP LOCKED. Failures back off (1, 4, 9 ... minutes) and stop
 * after 10 attempts so a poison message can't block the queue.
 */
export async function processOutbox(limit = 25): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  await withScope({ userId: null, bypass: true }, async (tx) => {
    const rows = await tx.execute<{ id: number; type: string; payload: Record<string, unknown>; attempts: number }>(sql`
      select id, type, payload, attempts from outbox
      where processed_at is null and available_at <= now() and attempts < 10
      order by id
      limit ${limit}
      for update skip locked`);
    const list = (Array.isArray(rows) ? rows : rows.rows) as { id: number; type: string; payload: Record<string, unknown>; attempts: number }[];
    for (const row of list) {
      const handler = handlers.get(row.type);
      try {
        await tx.execute(sql`savepoint outbox_item`);
        if (handler) await handler(tx, row.payload);
        await tx.execute(sql`release savepoint outbox_item`);
        await tx.update(outbox).set({ processedAt: new Date() }).where(eq(outbox.id, row.id));
        processed++;
      } catch (err) {
        await tx.execute(sql`rollback to savepoint outbox_item`);
        const attempts = row.attempts + 1;
        await tx
          .update(outbox)
          .set({
            attempts,
            lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
            availableAt: new Date(Date.now() + attempts * attempts * 60_000),
          })
          .where(eq(outbox.id, row.id));
        failed++;
      }
    }
  });
  return { processed, failed };
}
