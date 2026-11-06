import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { answerBuddyMatch, buddyAnswerInput } from "@/modules/connect/social";

type Ctx = { params: Promise<{ matchId: string }> };

/** { answer: "yes" | "no" }. Two yeses connect you; returns { status }. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return answerBuddyMatch(me.id, (await ctx.params).matchId, buddyAnswerInput.parse(await readJson(req)));
});
