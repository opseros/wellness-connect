import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { buddyInput, buddyOverview, requestBuddy } from "@/modules/connect/social";

/** { requests: your open requests, matches: suggestions (first name only until you both say yes) }. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return buddyOverview(me.id);
});

/** { activity, city, times[], pace?, note? }. Opens or updates your request for that activity and returns { request, suggested }. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return requestBuddy(me.id, buddyInput.parse(await readJson(req)));
});
