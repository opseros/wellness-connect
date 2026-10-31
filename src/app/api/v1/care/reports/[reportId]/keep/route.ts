import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { setReportKeep } from "@/modules/care/service";

type Ctx = { params: Promise<{ reportId: string }> };

/** { keep: boolean } — kept reports aren't deleted 90 days after the trip. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { keep } = z.object({ keep: z.boolean() }).parse(await readJson(req));
  await setReportKeep((await requireUser(req.headers)).id, (await ctx.params).reportId, keep);
  return { keep };
});
