"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import { addTimeOff, cancelSession, removeTimeOff, requestSession, respondToSession, saveBookingSettings, setWeeklyHours } from "@/modules/sessions/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const errorText = (e: unknown) =>
  e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";

async function run(back: string, ok: string, fn: () => Promise<unknown>, success?: (r: unknown) => string) {
  let target: string;
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    target = withMessage(success ? success(r) : back, "msg", ok);
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(back, "error", errorText(e));
  }
  redirect(target);
}

// ---------- Professional ----------

export async function saveSettingsAction(form: FormData) {
  const me = await requireUser();
  await run("/pro/schedule", "Booking settings saved.", () =>
    saveBookingSettings(me.id, {
      enabled: form.get("enabled") === "on",
      minNoticeHours: str(form, "minNoticeHours"),
      maxDaysAhead: str(form, "maxDaysAhead"),
      bufferMinutes: str(form, "bufferMinutes") || 0,
      meetingLink: str(form, "meetingLink"),
      inPersonAddress: str(form, "inPersonAddress"),
    } as never),
  );
}

export async function saveHoursAction(form: FormData) {
  const me = await requireUser();
  const rows: { weekday: number; start: string; end: string }[] = [];
  for (let w = 0; w < 7; w++) {
    for (const slot of ["a", "b"]) {
      const start = str(form, `d${w}${slot}s`);
      const end = str(form, `d${w}${slot}e`);
      if (start && end) rows.push({ weekday: w, start, end });
    }
  }
  await run("/pro/schedule", "Weekly hours saved.", () => setWeeklyHours(me.id, rows));
}

export async function addTimeOffAction(form: FormData) {
  const me = await requireUser();
  await run("/pro/schedule#off", "Day off added.", () => addTimeOff(me.id, str(form, "day")));
}

export async function removeTimeOffAction(form: FormData) {
  const me = await requireUser();
  await run("/pro/schedule#off", "Day off removed.", () => removeTimeOff(me.id, str(form, "day")));
}

export async function respondAction(form: FormData) {
  const me = await requireUser();
  const accept = str(form, "accept") === "1";
  await run("/pro/sessions", accept ? "Accepted. The member has been emailed." : "Declined. The time is free again.", () =>
    respondToSession(me.id, str(form, "id"), { accept, note: str(form, "note") }),
  );
}

// ---------- Member ----------

export async function requestSessionAction(form: FormData) {
  const me = await requireUser();
  const profileId = str(form, "profileId");
  const serviceId = str(form, "serviceId");
  await run(
    `/p/${profileId}/book?service=${serviceId}`,
    "Request sent. You'll get an email when they reply.",
    () =>
      requestSession(me.id, {
        serviceId,
        startsAt: str(form, "startsAt"),
        mode: str(form, "mode") as "online",
        note: str(form, "note"),
        idempotencyKey: str(form, "key") || randomUUID(),
      }),
    (r) => `/sessions/${(r as { id: string }).id}`,
  );
}

export async function cancelSessionAction(form: FormData) {
  const me = await requireUser();
  const id = str(form, "id");
  const back = str(form, "back") || `/sessions/${id}`;
  await run(back.startsWith("/") ? back : `/sessions/${id}`, "Cancelled. The other side has been emailed.", () => cancelSession(me.id, id, { reason: str(form, "reason") }));
}
