import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Razorpay client over fetch (no SDK). Keys come from the
 * environment; without them online payment is hidden and companies pay by
 * invoice. Use test keys (rzp_test_...) until KYC is approved.
 */
const API = "https://api.razorpay.com/v1";

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests replace the network with a fake Razorpay. */
export function setRazorpayFetchForTesting(f: typeof fetch | undefined) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID ?? "";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay keys are not set");
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "x-razorpay-idempotency": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${path} failed (${res.status}): ${json.error?.description ?? "unknown error"}`);
  return json;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string; status: string };
export type RazorpayRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" };

export function createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>("POST", "/orders", { amount: input.amountPaise, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes });
}

export function createRefund(input: { paymentId: string; amountPaise: number; refundId: string }) {
  // Our refund id doubles as Razorpay's idempotency key, so a retry never refunds twice.
  return call<RazorpayRefund>("POST", `/payments/${input.paymentId}/refund`, { amount: input.amountPaise, speed: "normal", notes: { refundId: input.refundId } }, input.refundId);
}

function safeEqualHex(expected: string, given: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success handler: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

/** Webhooks: X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}
