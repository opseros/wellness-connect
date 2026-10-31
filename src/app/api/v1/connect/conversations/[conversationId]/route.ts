import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { openConversation } from "@/modules/connect/service";

type Ctx = { params: Promise<{ conversationId: string }> };

/** Messages in a conversation I'm part of; marks it read. */
export const GET = handle(async (req: Request, ctx: Ctx) => openConversation((await requireUser(req.headers)).id, (await ctx.params).conversationId));
