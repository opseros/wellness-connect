import { AppError } from "@/lib/errors";
import { getPrivateFile } from "@/lib/storage";
import { getCurrentUser } from "@/modules/identity/session";
import { openListingPhoto } from "@/modules/listings/service";

type Ctx = { params: Promise<{ photoId: string }> };

/**
 * Listing photos: anyone may see photos of a VERIFIED homestay or hospital;
 * before that, only its team. Files stay in private storage; this route is the
 * only way to them. Images only (JPG/PNG/WebP), served with nosniff.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const me = await getCurrentUser();
    const { blobPath, isPublic } = await openListingPhoto(me?.id ?? null, (await ctx.params).photoId);
    const file = await getPrivateFile(blobPath);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: {
        "content-type": file.contentType,
        "cache-control": isPublic ? "public, max-age=300" : "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
