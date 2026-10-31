import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { linkTripStay } from "@/modules/care/service";

type Ctx = { params: Promise<{ tripId: string }> };

/** { stayId: string | null } — link one of your homestay stays to the trip. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { stayId } = z.object({ stayId: z.string().uuid().nullable() }).parse(await readJson(req));
  await linkTripStay((await requireUser(req.headers)).id, (await ctx.params).tripId, stayId);
  return { stayId };
});
