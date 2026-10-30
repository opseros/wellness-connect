import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { sendMessage, messageInput } from "@/modules/connect/service";

/** { toUserId, body } — connections only unless the recipient opened messages to all. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return sendMessage(me.id, messageInput.parse(await readJson(req)));
});
