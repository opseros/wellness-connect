import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listChallenges } from "@/modules/connect/challenges";

/** Live, upcoming and recently ended challenges you can see, with your own progress only. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return listChallenges(me.id);
});
