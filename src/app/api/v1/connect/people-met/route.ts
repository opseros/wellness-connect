import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { peopleYouMet } from "@/modules/connect/service";

/** People who checked in at the same meet-ups as you in the last 30 days. ?postId= for one meet-up. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const postId = new URL(req.url).searchParams.get("postId") ?? undefined;
  return peopleYouMet(me.id, { postId });
});
