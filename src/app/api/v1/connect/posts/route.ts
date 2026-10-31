import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { createPost, getFeed, postInput } from "@/modules/connect/service";

/** GET ?show=all|connections|spaces|meetups&before=<ISO time>&limit=30 */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return getFeed(me.id, Object.fromEntries(new URL(req.url).searchParams));
});

export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return createPost(me.id, postInput.parse(await readJson(req)));
});
