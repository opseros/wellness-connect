import { AppError } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { getOrgInvoice } from "@/modules/marketplace/service";
import { renderInvoicePdf } from "@/modules/marketplace/invoice-pdf";

type Ctx = { params: Promise<{ orgId: string; invoiceId: string }> };

/** The invoice or credit note as a PDF (company owners, admins and wellness managers). */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const me = await requireUser(req.headers);
    const { orgId, invoiceId } = await ctx.params;
    const d = await getOrgInvoice(me.id, orgId, invoiceId);
    const pdf = await renderInvoicePdf(d.invoice, { relatedNumber: d.relatedNumber, bankDetails: d.bankDetails });
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${d.invoice.number.replace(/\//g, "-")}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
