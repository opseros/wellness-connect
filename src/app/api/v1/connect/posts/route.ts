import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createPost, getFeed, postInput } from "@/modules/connect/service";

export const GET = handle(async (req: Request) => getFeed((await requireUser(req.headers)).id));

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createPost(me.id, postInput.parse(await readJson(req)));
});
