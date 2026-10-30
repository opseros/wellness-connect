import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { withdrawProposal } from "@/modules/marketplace/service";

type Ctx = { params: Promise<{ proposalId: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => withdrawProposal((await requireUser(req.headers)).id, (await ctx.params).proposalId));
