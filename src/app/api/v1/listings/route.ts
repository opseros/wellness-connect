import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createListingInput, createListingOrg } from "@/modules/listings/service";

/** { kind: "homestay" | "hospital" | "facility", name, city } — creates the organisation (you become owner) with a draft listing. */
export const POST = handle(async (req: Request) => createListingOrg(await requireUser(req.headers), createListingInput.parse(await readJson(req))));
