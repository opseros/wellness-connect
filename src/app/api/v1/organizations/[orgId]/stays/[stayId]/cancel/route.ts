import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { cancelInput, hostCancelStay } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string; stayId: string }> };

/** Host owners/admins: { reason }. The guest is refunded in full. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, stayId } = await ctx.params;
  return hostCancelStay(me.id, orgId, stayId, cancelInput.parse(await readJson(req)));
});
