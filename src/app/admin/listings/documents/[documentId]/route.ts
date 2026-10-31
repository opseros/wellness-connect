import { AppError } from "@/lib/errors";
import { getPrivateFile } from "@/lib/storage";
import { requirePlatformStaff } from "@/modules/identity/session";
import { openOrgDocument } from "@/modules/admin/service";

type Ctx = { params: Promise<{ documentId: string }> };

/** Streams a homestay/hospital verification document to platform staff only; every open is audited. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const staff = await requirePlatformStaff(req.headers);
    const file = await getPrivateFile(await openOrgDocument(staff, (await ctx.params).documentId));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: { "content-type": file.contentType, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: e.status === 403 ? 404 : e.status });
    throw e;
  }
}
