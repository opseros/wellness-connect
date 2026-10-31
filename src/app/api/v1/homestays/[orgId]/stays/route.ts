import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { requestStay, stayRequestInput } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Request to book: { checkIn, checkOut, rooms, guests, purpose, accessNeeds[], message, billingName?, billingGstin? }. No medical details. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return requestStay(me, (await ctx.params).orgId, stayRequestInput.parse(await readJson(req)));
});
