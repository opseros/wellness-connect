import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { approveMember, listPendingMembers, approveMemberInput } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Pending join requests (owners and admins only). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return listPendingMembers(me.id, (await ctx.params).orgId);
});

/** Approve a pending member with a role: { membershipId, role }. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return approveMember(me.id, (await ctx.params).orgId, approveMemberInput.parse(await readJson(req)));
});
