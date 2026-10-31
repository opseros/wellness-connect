import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { CONSENT_TEXT, shareInput, shareReport } from "@/modules/care/service";

type Ctx = { params: Promise<{ reportId: string }> };

/** The consent text the app must show before sharing. */
export const GET = handle(async () => ({ consentText: CONSENT_TEXT }));

/** { orgId, consent: true } — records consent and shares the report with that hospital. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  await shareReport(me.id, (await ctx.params).reportId, shareInput.parse(await readJson(req)));
  return { shared: true };
});
