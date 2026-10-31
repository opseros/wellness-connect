import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createMeetup, listUpcomingMeetups, meetupInput } from "@/modules/connect/service";

export const GET = handle(async (req: Request) => listUpcomingMeetups((await requireUser(req.headers)).id));

/** { body, eventAt (ISO), eventPlace, eventCity?, groupId? } */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createMeetup(me.id, meetupInput.parse(await readJson(req)));
});
