import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { tripInput, updateTrip } from "@/modules/care/service";

type Ctx = { params: Promise<{ tripId: string }> };

/** { arriveOn?, departOn?, notes? } — departure sets the report deletion date (90 days later). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return updateTrip(me.id, (await ctx.params).tripId, tripInput.parse(await readJson(req)));
});
