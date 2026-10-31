import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { submitListing } from "@/modules/listings/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Sends the listing for verification; 400 lists what's still needed. */
export const POST = handle(async (req: Request, ctx: Ctx) => submitListing((await requireUser(req.headers)).id, (await ctx.params).orgId));
