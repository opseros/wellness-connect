import { handle } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { uploadReport } from "@/modules/care/service";

type Ctx = { params: Promise<{ requestId: string }> };

/** multipart/form-data: file (PDF/JPG/PNG, max 4 MB), name?. Encrypted; shared with no one until you share it. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const form = await req.formData().catch(() => {
    throw badRequest("Send multipart/form-data");
  });
  return uploadReport(me.id, (await ctx.params).requestId, form.get("file"), String(form.get("name") ?? ""));
});
