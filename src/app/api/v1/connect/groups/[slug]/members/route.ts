import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getGroup, joinGroup, leaveGroup } from "@/modules/connect/service";

type Ctx = { params: Promise<{ slug: string }> };

/** Join (or ask to join) the group. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const g = await getGroup(me.id, (await ctx.params).slug);
  return joinGroup(me.id, g.group.id);
});

/** Leave the group. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const g = await getGroup(me.id, (await ctx.params).slug);
  await leaveGroup(me.id, g.group.id);
  return { left: true };
});
