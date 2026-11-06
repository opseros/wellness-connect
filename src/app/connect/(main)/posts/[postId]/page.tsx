import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getPost, listComments, peopleYouMet } from "@/modules/connect/service";
import { connectAction } from "../../../actions";
import { Avatar, Flash, PostCard } from "../../../ui";

export const metadata = { title: "Post" };

/** One post with its whole conversation; the link people share. */
export default async function PostPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ postId }, sp] = await Promise.all([params, searchParams]);
  const missing = (e: unknown) => {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  };
  const [p, comments] = await Promise.all([getPost(me.id, postId).catch(missing), listComments(me.id, postId).catch(missing)]);
  const met = p.kind === "meetup" && p.hereByMe ? await peopleYouMet(me.id, { postId: p.id }) : [];
  return (
    <main className="flex max-w-[720px] flex-col gap-4">
      <Link href="/connect" className="text-sm font-semibold text-brand hover:underline">← Feed</Link>
      <h1 className="sr-only">{p.title ?? `Post by ${p.authorName}`}</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <PostCard p={p} me={me.id} back={`/connect/posts/${p.id}`} comments={comments} full />
      {p.kind === "meetup" && p.hereByMe && (
        <section id="met" aria-labelledby="met-h" className="card flex scroll-mt-24 flex-col gap-3 p-5">
          <div>
            <h2 id="met-h" className="font-display text-[19px] font-bold">Who else came</h2>
            <p className="text-[14px] text-muted">Only people who checked in see this list. Connect to stay in touch.</p>
          </div>
          {met.length === 0 ? (
            <p className="text-sm text-muted">No one else has checked in yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {met.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/connect/members/${m.userId}`} className="flex min-w-0 items-center gap-3">
                    <Avatar name={m.name} size={40} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{m.name}</span>
                      <span className="truncate text-[13px] text-muted">{m.headline || "Member"}</span>
                    </span>
                  </Link>
                  {m.state === "none" ? (
                    <form action={connectAction}>
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="back" value={`/connect/posts/${p.id}#met`} />
                      <button className="btn-outline min-h-9 rounded-full px-4 text-sm">Connect</button>
                    </form>
                  ) : (
                    <span className="text-[13px] font-semibold text-muted">{{ connected: "Connected", sent: "Requested", received: "Wants to connect", self: "" }[m.state]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
