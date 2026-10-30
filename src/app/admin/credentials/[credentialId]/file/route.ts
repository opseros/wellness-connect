import { AppError } from "@/lib/errors";
import { getPrivateFile } from "@/lib/storage";
import { requirePlatformStaff } from "@/modules/identity/session";
import { openCredentialDocument } from "@/modules/admin/service";

type Ctx = { params: Promise<{ credentialId: string }> };

/**
 * Streams a private credential document to platform staff only. The file is
 * never public and has no shareable URL; every open is audited. Uploads are
 * limited to PDF/JPG/PNG and served with nosniff, so nothing executes.
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const staff = await requirePlatformStaff(req.headers);
    const path = await openCredentialDocument(staff, (await ctx.params).credentialId);
    const file = await getPrivateFile(path);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": "inline",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.status === 403 ? "Not found" : e.message, { status: e.status === 403 ? 404 : e.status });
    throw e;
  }
}
