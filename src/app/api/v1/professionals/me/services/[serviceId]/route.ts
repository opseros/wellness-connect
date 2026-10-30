import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getOwnService, serviceInput, setServiceActive, updateService } from "@/modules/professionals/service";

type Ctx = { params: Promise<{ serviceId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => getOwnService((await requireUser(req.headers)).id, (await ctx.params).serviceId));

/** Full service body to edit it, or just { active } to pause/resume. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { serviceId } = await ctx.params;
  const body = await readJson(req);
  const toggle = z.object({ active: z.boolean() }).strict().safeParse(body);
  if (toggle.success) return setServiceActive(me.id, serviceId, toggle.data.active);
  return updateService(me.id, serviceId, serviceInput.parse(body));
});
