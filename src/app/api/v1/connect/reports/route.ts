import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { reportContent, reportInput } from "@/modules/connect/service";

/** { targetType: "post" | "comment" | "message" | "user" | "group", targetId, reason } */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return reportContent(me.id, reportInput.parse(await readJson(req)));
});
