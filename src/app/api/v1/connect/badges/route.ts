import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { connectBadges } from "@/modules/connect/service";

/** { invites, unread, referrals } for navigation badges. */
export const GET = handle(async (req: Request) => connectBadges((await requireUser(req.headers)).id));
