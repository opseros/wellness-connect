import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getOwnProfile, upsertProfessionalProfile, profileInput } from "@/modules/professionals/service";

export const GET = handle(async (req: Request) => getOwnProfile((await requireUser(req.headers)).id));

export const PUT = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return upsertProfessionalProfile(me.id, profileInput.parse(await readJson(req)));
});
