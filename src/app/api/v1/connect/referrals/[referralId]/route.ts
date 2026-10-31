import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { referralUpdateInput, updateReferral } from "@/modules/connect/service";

type Ctx = { params: Promise<{ referralId: string }> };

/** Receiver: { status: "accepted" | "declined" | "completed" }; sender: { status: "withdrawn" }; optional note. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return updateReferral(me.id, (await ctx.params).referralId, referralUpdateInput.parse(await readJson(req)));
});
