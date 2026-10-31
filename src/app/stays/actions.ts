"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import { cancelStayAsGuest, requestStay } from "@/modules/stays/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const msgOf = (e: unknown) => (e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.");

export async function requestStayAction(form: FormData) {
  const me = await requireUser();
  const back = str(form, "back").startsWith("/homestays/") ? str(form, "back") : "/homestays";
  let target: string;
  try {
    const s = await requestStay(me, str(form, "orgId"), {
      checkIn: str(form, "checkIn"),
      checkOut: str(form, "checkOut"),
      rooms: str(form, "rooms") || 1,
      guests: str(form, "guests") || 1,
      purpose: str(form, "purpose") as "care" | "rest" | "retreat",
      accessNeeds: form.getAll("accessNeeds").map(String) as never,
      message: str(form, "message"),
      billingName: str(form, "billingName"),
      billingGstin: str(form, "billingGstin"),
    });
    target = withMessage(`/stays/${s.id}`, "msg", "Request sent. The host has 48 hours to answer; you'll get an email. You won't be charged until they accept and you pay.");
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(back, "error", msgOf(e));
  }
  redirect(target);
}

export async function cancelStayAction(form: FormData) {
  const me = await requireUser();
  const id = str(form, "stayId");
  let target: string;
  try {
    const r = await cancelStayAsGuest(me.id, id, { reason: str(form, "reason") });
    revalidatePath(`/stays/${id}`);
    target = withMessage(`/stays/${id}`, "msg", r.refundPaise > 0 ? `Cancelled. ₹${(r.refundPaise / 100).toLocaleString("en-IN")} will be refunded to your payment method.` : "Cancelled.");
  } catch (e) {
    target = withMessage(`/stays/${id}`, "error", msgOf(e));
  }
  redirect(target);
}
