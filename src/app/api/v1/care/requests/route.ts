import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { careRequestInput, createCareRequest, listMyCareRequests } from "@/modules/care/service";

export const GET = handle(async (req: Request) => listMyCareRequests((await requireUser(req.headers)).id));

/** { treatment, specialty?, ageRange, travellingFrom, arriveMonth?, companions, needs[], interpreterLanguage?, note?, hospitalIds[1..3] }. 403 while Care & Travel is switched off. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createCareRequest(me.id, careRequestInput.parse(await readJson(req)));
});
