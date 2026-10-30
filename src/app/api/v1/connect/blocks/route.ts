import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { blockMember } from "@/modules/connect/service";

/** { userId } — hides their posts and stops messages both ways. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const { userId } = z.object({ userId: z.string().uuid() }).parse(await readJson(req));
  await blockMember(me.id, userId);
  return { blocked: true };
});
