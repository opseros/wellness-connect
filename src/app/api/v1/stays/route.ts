import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listMyStays } from "@/modules/stays/service";

/** My stays as a guest, newest check-in first. */
export const GET = handle(async (req: Request) => listMyStays((await requireUser(req.headers)).id));
