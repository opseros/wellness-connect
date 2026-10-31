import { AppError } from "@/lib/errors";
import { getPrivateFile } from "@/lib/storage";
import { requireUser } from "@/modules/identity/session";
import { openOwnDocument } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string; documentId: string }> };

/** A team member opens one of their organisation's own verification documents. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const me = await requireUser(req.headers);
    const { orgId, documentId } = await ctx.params;
    const file = await getPrivateFile(await openOwnDocument(me.id, orgId, documentId));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: { "content-type": file.contentType, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: e.status === 401 ? 401 : 404 });
    throw e;
  }
}
