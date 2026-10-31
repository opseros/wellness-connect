import { AppError } from "@/lib/errors";
import { getPrivateFile } from "@/lib/storage";
import { requirePlatformStaff } from "@/modules/identity/session";
import { openListingPhotoAsStaff } from "@/modules/admin/service";

type Ctx = { params: Promise<{ photoId: string }> };

/** Staff see listing photos before the listing is public. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const staff = await requirePlatformStaff(req.headers);
    const { blobPath } = await openListingPhotoAsStaff(staff, (await ctx.params).photoId);
    const file = await getPrivateFile(blobPath);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body as BodyInit, { headers: { "content-type": file.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
