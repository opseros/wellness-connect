import { handle } from "@/lib/api";
import { listPublicPackages } from "@/modules/care/service";

type Ctx = { params: Promise<{ orgId: string }> };

/** Public: a verified hospital's active treatment packages (indicative prices in paise). */
export const GET = handle(async (_req: Request, ctx: Ctx) => listPublicPackages((await ctx.params).orgId));
