import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createOrganization, listMemberships, createOrganizationInput } from "@/modules/organizations/service";

export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return listMemberships(me.id);
});

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createOrganization(me, createOrganizationInput.parse(await readJson(req)));
});
