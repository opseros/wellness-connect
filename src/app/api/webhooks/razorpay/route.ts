import { AppError } from "@/lib/errors";
import { handleRazorpayWebhook } from "@/modules/marketplace/service";

/**
 * Razorpay webhook. Set it up in the Razorpay dashboard with the secret in
 * RAZORPAY_WEBHOOK_SECRET and these events: payment.captured, order.paid,
 * payment.failed, refund.processed, refund.failed.
 * The signature is checked over the RAW body; each event id is processed once.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const r = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature") ?? "", req.headers.get("x-razorpay-event-id") ?? "");
    return Response.json({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    if (e instanceof AppError && e.status === 403) return Response.json({ error: "invalid signature" }, { status: 400 });
    console.error("razorpay webhook failed", e);
    // A 5xx makes Razorpay retry later; nothing was committed.
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
