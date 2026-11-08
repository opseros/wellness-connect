"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import { buyPlanWithCredits } from "@/modules/marketplace/credits";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function buyPlanWithCreditsAction(form: FormData) {
  const me = await requireUser();
  const back = str(form, "back").startsWith("/facilities/") ? str(form, "back") : "/explore?tab=gyms";
  let target: string;
  try {
    await buyPlanWithCredits(me.id, str(form, "planId"), { idempotencyKey: str(form, "key") });
    revalidatePath("/", "layout");
    target = withMessage("/bookings", "msg", "Plan bought with your wellness credits. You'll get a confirmation email; show your name at the front desk.");
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(back, "error", e instanceof AppError ? e.message : "Something went wrong. Please try again.");
  }
  redirect(target);
}
