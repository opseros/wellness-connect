import { handle } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { addPhoto } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** multipart/form-data: file (JPG/PNG/WebP, max 4 MB), caption?. Public only once the listing is verified. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const form = await req.formData().catch(() => {
    throw badRequest("Send multipart/form-data");
  });
  return addPhoto(me.id, (await ctx.params).orgId, form.get("file"), String(form.get("caption") ?? ""));
});
