import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { getMemberProfile, profileInput } from "@/modules/connect/service";
import { saveProfileAndCircles } from "@/modules/connect/social";

/** Your Connect profile. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return (await getMemberProfile(me.id)) ?? null;
});

/** { headline?, city?, jobTitle?, company?, topics?, intro?, openTo?, visibility?, messagesFromConnectionsOnly? }. Changing city moves you to that city's circle. */
export const PATCH = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return saveProfileAndCircles(me.id, profileInput.parse(await readJson(req)));
});
