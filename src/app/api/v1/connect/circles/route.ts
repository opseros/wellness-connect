import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { cityCircles, myCircles, syncCircles } from "@/modules/connect/social";

/** { mine: your city and company circles, cities: the biggest city circles }. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  await syncCircles(me.id);
  const [mine, cities] = await Promise.all([myCircles(me.id), cityCircles()]);
  return { mine, cities };
});
