import { AppError } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { getStayInvoice } from "@/modules/marketplace/stay-payments";
import { renderInvoicePdf } from "@/modules/marketplace/invoice-pdf";

type Ctx = { params: Promise<{ stayId: string; invoiceId: string }> };

/** The guest's stay invoice or credit note as a PDF (row-level security limits it to their own). */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const me = await requireUser(req.headers);
    const d = await getStayInvoice({ userId: me.id }, (await ctx.params).invoiceId);
    const pdf = await renderInvoicePdf(d.invoice, { relatedNumber: d.relatedNumber });
    return new Response(pdf as BodyInit, {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${d.invoice.number.replace(/\//g, "-")}.pdf"`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: e.status === 401 ? 401 : 404 });
    throw e;
  }
}
