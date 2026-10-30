import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listOrgProposals } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ orgId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => listOrgProposals((await requireUser(req.headers)).id, (await ctx.params).orgId));
