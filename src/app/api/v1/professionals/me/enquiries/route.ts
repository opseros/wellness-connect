import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMyEnquiries } from "@/modules/marketplace/service";

export const GET = handle(async (req: Request) => listMyEnquiries((await requireUser(req.headers)).id));
