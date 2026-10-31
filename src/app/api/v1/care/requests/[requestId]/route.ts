import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getCareRequest } from "@/modules/care/service";

type Ctx = { params: Promise<{ requestId: string }> };

/** Quotes to compare, reports with shares and access log, trip plan. */
export const GET = handle(async (req: Request, ctx: Ctx) => getCareRequest((await requireUser(req.headers)).id, (await ctx.params).requestId));
