import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { addService, listOwnServices, serviceInput } from "@/modules/professionals/service";

export const GET = handle(async (req: Request) => listOwnServices((await requireUser(req.headers)).id));

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return addService(me.id, serviceInput.parse(await readJson(req)));
});
