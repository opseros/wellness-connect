import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMyProposals } from "@/modules/marketplace/service";

export const GET = handle(async (req: Request) => listMyProposals((await requireUser(req.headers)).id));
