import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { respondToConnection } from "@/modules/connect/service";

type Ctx = { params: Promise<{ connectionId: string }> };

/** { accept: true | false } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { accept } = z.object({ accept: z.boolean() }).parse(await readJson(req));
  return respondToConnection(me.id, (await ctx.params).connectionId, accept);
});
