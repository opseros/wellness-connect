import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { inviteInput, inviteMember, listInvitations } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listInvitations((await requireUser(req.headers)).id, (await ctx.params).orgId));

/** { email, role } — emails an invitation link that expires in 14 days. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return inviteMember(me.id, (await ctx.params).orgId, inviteInput.parse(await readJson(req)));
});
