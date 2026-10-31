import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { toggleChecklist } from "@/modules/care/service";

type Ctx = { params: Promise<{ tripId: string }> };

/** { key, done } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { key, done } = z.object({ key: z.string(), done: z.boolean() }).parse(await readJson(req));
  await toggleChecklist((await requireUser(req.headers)).id, (await ctx.params).tripId, key, done);
  return { key, done };
});
