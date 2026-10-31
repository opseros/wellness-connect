import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { calendarInput, getHostCalendar, updateCalendar } from "@/modules/stays/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** ?month=YYYY-MM → each day's price, blocked flag and rooms booked. Team members. */
export const GET = handle(async (req: Request, ctx: Ctx) => getHostCalendar((await requireUser(req.headers)).id, (await ctx.params).orgId, new URL(req.url).searchParams.get("month") ?? ""));

/** Owners/admins: { from, to, action: "price" | "clear_price" | "block" | "unblock", priceRupees? }. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  return updateCalendar(me.id, (await ctx.params).orgId, calendarInput.parse(await readJson(req)));
});
