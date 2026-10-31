import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createGroup, groupInput, listGroups } from "@/modules/connect/service";

/** Spaces and communities with member counts and my status. */
export const GET = handle(async (req: Request) => listGroups((await requireUser(req.headers)).id));

/** { name, about?, city?, privacy: "public" | "approval" } — I become its moderator. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createGroup(me.id, groupInput.parse(await readJson(req)));
});
