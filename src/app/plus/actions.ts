"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import { joinPlusWaitlist, leavePlusWaitlist } from "@/modules/platform/plus";

export async function plusWaitlistAction(form: FormData) {
  const me = await requireUser();
  const join = form.get("join") === "1";
  if (join) await joinPlusWaitlist(me.id);
  else await leavePlusWaitlist(me.id);
  revalidatePath("/plus");
  redirect(withMessage("/plus", "msg", join ? "You're on the list. We'll email you when Plus opens." : "You've left the waitlist."));
}
