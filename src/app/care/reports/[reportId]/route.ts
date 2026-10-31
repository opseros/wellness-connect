import { AppError } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { openOwnReport } from "@/modules/care/service";

type Ctx = { params: Promise<{ reportId: string }> };

/** The traveller opens their own report (decrypted). */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const me = await requireUser(req.headers);
    const f = await openOwnReport(me.id, (await ctx.params).reportId);
    return new Response(new Uint8Array(f.body), {
      headers: { "content-type": f.contentType, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: e.status === 401 ? 401 : 404 });
    throw e;
  }
}
