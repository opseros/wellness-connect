import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { revokeInvitation } from "@/modules/organizations/service";

type Ctx = { params: Promise<{ orgId: string; invitationId: string }> };

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, invitationId } = await ctx.params;
  await revokeInvitation(me.id, orgId, invitationId);
  return { revoked: true };
});
