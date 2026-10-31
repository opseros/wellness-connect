import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getGroup, moderateInput, moderateMember } from "@/modules/connect/service";

type Ctx = { params: Promise<{ slug: string; userId: string }> };

/** Moderators only: { action: "approve" | "decline" | "remove" | "make_moderator" } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { slug, userId } = await ctx.params;
  const g = await getGroup(me.id, slug);
  return moderateMember(me.id, g.group.id, userId, moderateInput.parse(await readJson(req)));
});
