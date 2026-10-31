import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { acceptQuote } from "@/modules/care/service";

type Ctx = { params: Promise<{ requestId: string }> };

/** { quoteId } — accepts one quote, closes the others, starts the trip plan, shares your name and email with that hospital. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(await readJson(req));
  return acceptQuote(me.id, (await ctx.params).requestId, quoteId);
});
