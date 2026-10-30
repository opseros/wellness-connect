import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMemberships } from "@/modules/organizations/service";
import { getOwnProfile } from "@/modules/professionals/service";

export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const [memberships, professional] = await Promise.all([listMemberships(me.id), getOwnProfile(me.id)]);
  return {
    user: me,
    memberships: memberships.map((m) => ({ orgId: m.organization.id, orgName: m.organization.name, role: m.membership.role, status: m.membership.status })),
    professional: professional ? { id: professional.id, verificationStatus: professional.verificationStatus } : null,
  };
});
