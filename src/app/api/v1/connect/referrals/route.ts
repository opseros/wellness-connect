import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createReferral, listReferrals, referralInput } from "@/modules/connect/service";

/** Referrals I sent and received, with their status trail. */
export const GET = handle(async (req: Request) => listReferrals((await requireUser(req.headers)).id));

/** Professionals only, to a connected professional: { toUserId, categoryId?, clientLabel, note }. No contact or health details. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createReferral(me.id, referralInput.parse(await readJson(req)));
});
