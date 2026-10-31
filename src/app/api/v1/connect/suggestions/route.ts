import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { suggestMembers } from "@/modules/connect/service";

/** People you may know: shared topics and same city, excluding connections and blocks. */
export const GET = handle(async (req: Request) => suggestMembers((await requireUser(req.headers)).id));
