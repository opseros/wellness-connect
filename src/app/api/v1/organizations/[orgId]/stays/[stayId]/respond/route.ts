import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { respondInput, respondToStay } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string; stayId: string }> };

/** Host owners/admins: { accept: boolean, note? }. Accepting holds the rooms for 48 hours for the guest to pay. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, stayId } = await ctx.params;
  return respondToStay(me.id, orgId, stayId, respondInput.parse(await readJson(req)));
});
