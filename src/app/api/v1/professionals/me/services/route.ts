import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { addService, serviceInput } from "@/modules/professionals/service";

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return addService(me.id, serviceInput.parse(await readJson(req)));
});
