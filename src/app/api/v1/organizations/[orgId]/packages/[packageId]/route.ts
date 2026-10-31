import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { packageInput, setPackageActive, updatePackage } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string; packageId: string }> };

/** Full update (same body as create), or { active: boolean } to show/hide. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const { orgId, packageId } = await ctx.params;
  const body = await readJson(req);
  const toggle = z.object({ active: z.boolean() }).strict().safeParse(body);
  if (toggle.success) return setPackageActive(me.id, orgId, packageId, toggle.data.active);
  return updatePackage(me.id, orgId, packageId, packageInput.parse(body));
});
