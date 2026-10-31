import { AppError } from "@/lib/errors";
import { requirePlatformStaff } from "@/modules/identity/session";
import { adminInvoice } from "@/modules/admin/service";
import { renderInvoicePdf } from "@/modules/marketplace/invoice-pdf";

type Ctx = { params: Promise<{ invoiceId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const staff = await requirePlatformStaff(req.headers);
    const d = await adminInvoice(staff, (await ctx.params).invoiceId);
    const pdf = await renderInvoicePdf(d.invoice, { relatedNumber: d.relatedNumber, bankDetails: d.bankDetails });
    return new Response(Buffer.from(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${d.invoice.number.replace(/\//g, "-")}.pdf"`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(e.status === 403 ? "Not found" : e.message, { status: e.status === 403 ? 404 : e.status });
    throw e;
  }
}
