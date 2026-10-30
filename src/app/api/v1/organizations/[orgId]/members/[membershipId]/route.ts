import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { changeMemberRole, memberRoleInput, removeMember } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ orgId: string; membershipId: string }> };

/** { role }: change a member's role, or approve a pending request with that role. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, membershipId } = await ctx.params;
  return changeMemberRole(me.id, orgId, membershipId, memberRoleInput.parse(await readJson(req)));
});

/** Remove a member or decline a pending request. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, membershipId } = await ctx.params;
  await removeMember(me.id, orgId, membershipId);
  return { removed: true };
});
