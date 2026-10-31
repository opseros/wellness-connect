import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { quoteReplyInput, replyToQuote } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string; quoteId: string }> };

/** Hospital owners/admins: { action: "quote", priceMinRupees, priceMaxRupees, validUntil, ... } | { action: "decline" | "ask_reports", message }. Shared reports open at /listing/<orgId>/reports/<reportId> (logged). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, quoteId } = await ctx.params;
  await replyToQuote(me.id, orgId, quoteId, quoteReplyInput.parse(await readJson(req)));
  return { ok: true };
});
