import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listConversations } from "@/modules/connect/service";

/** My conversations with unread counts and the last message. */
export const GET = handle(async (req: Request) => listConversations((await requireUser(req.headers)).id));
