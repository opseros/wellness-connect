"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (e: string, f: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

function loadCheckout(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout didn't load")));
    s.onerror = () => reject(new Error("Couldn't reach Razorpay. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

/** Opens Razorpay Checkout (UPI, cards, net banking), then confirms the payment with our server. */
export function PayOnline({ orgId, bookingId, label, brand, description }: { orgId: string; bookingId: string; label: string; brand: string; description: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/organizations/${orgId}/bookings/${bookingId}/payment`;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/order`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Couldn't start the payment");
      const o = json.data as { keyId: string; orderId: string; amountPaise: number; currency: string; prefill: { name: string; email: string } };
      const Razorpay = await loadCheckout();
      const rzp = new Razorpay({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amountPaise,
        currency: o.currency,
        name: brand,
        description,
        prefill: o.prefill,
        theme: { color: "#0f6b5c" },
        handler: async (r: RazorpayResponse) => {
          const v = await fetch(`${base}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
          if (!v.ok) setError("We couldn't confirm the payment yet. If money was taken, it will show as paid within a few minutes.");
          router.refresh();
          setBusy(false);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (r) => setError(r.error?.description ?? "The payment didn't go through. You can try again."));
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={pay} disabled={busy} className="btn-primary w-full">{busy ? "Opening secure checkout…" : label}</button>
      {error && <p role="alert" className="rounded-lg bg-[#fbe9e6] px-3 py-2 text-sm text-[#9b2c1f]">{error}</p>}
    </div>
  );
}
