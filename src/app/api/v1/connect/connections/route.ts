import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { listInvitations, requestConnection } from "@/modules/connect/service";

/** Pending invitations sent to me. */
export const GET = handle(async (req: Request) => listInvitations((await requireUser(req.headers)).id));

/** { toUserId } */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const { toUserId } = z.object({ toUserId: z.string().uuid() }).parse(await readJson(req));
  return requestConnection(me.id, toUserId);
});
