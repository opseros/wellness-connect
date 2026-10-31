import { handle } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { uploadDocument } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** multipart/form-data: docType (checklist key), name?, file (PDF/JPG/PNG, max 4 MB). Private; staff views are audited. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const form = await req.formData().catch(() => {
    throw badRequest("Send multipart/form-data");
  });
  return uploadDocument(me.id, (await ctx.params).orgId, { docType: String(form.get("docType") ?? ""), name: String(form.get("name") ?? "") }, form.get("file"));
});
