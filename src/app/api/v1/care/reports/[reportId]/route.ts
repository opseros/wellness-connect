import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { deleteReport } from "@/modules/care/service";

type Ctx = { params: Promise<{ reportId: string }> };

/** Delete now: the file is destroyed and all sharing ends. Download your report at /care/reports/<id>. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  await deleteReport((await requireUser(req.headers)).id, (await ctx.params).reportId);
  return { deleted: true };
});
