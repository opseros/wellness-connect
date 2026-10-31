import { AppError } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { openSharedReport } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string; reportId: string }> };

/** A hospital team member opens a report the patient shared with them. Decrypted on the fly; every open is logged. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const me = await requireUser(req.headers);
    const { orgId, reportId } = await ctx.params;
    const f = await openSharedReport(me.id, orgId, reportId);
    return new Response(new Uint8Array(f.body), {
      headers: { "content-type": f.contentType, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: e.status === 401 ? 401 : 404 });
    throw e;
  }
}
