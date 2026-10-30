import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/brand";
import { mainNav } from "@/components/nav";
import { getCurrentUser } from "@/modules/identity/session";
import { getFeed, listInvitations } from "@/modules/connect/service";
import { createPostAction, toggleLikeAction } from "@/app/app/actions";
import { navOptions } from "@/components/nav-options";

const when = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(d);

export default async function ConnectFeedPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect("/check-email");
  const [feed, invites] = await Promise.all([getFeed(me.id), listInvitations(me.id)]);

  return (
    <div>
      <AppHeader name={me.name} nav={mainNav(me, "connect", await navOptions(me.id))} />
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-5 px-6 py-7">
        <main className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
          <form action={createPostAction} className="card flex flex-col gap-3 p-4">
            <label htmlFor="body" className="label">Start a post</label>
            <textarea id="body" name="body" rows={2} maxLength={3000} required className="input py-3" placeholder="Share an idea, article or question with your network" />
            <div className="flex items-center justify-between text-[13px] text-muted">
              <span>Please don&apos;t share health details about yourself or others.</span>
              <button className="btn-primary">Post</button>
            </div>
          </form>
          {feed.length === 0 && (
            <p className="card p-6 text-[15px] text-muted">Your feed is empty. Connect with people or write the first post.</p>
          )}
          {feed.map((p) => (
            <article key={p.id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-col">
                <span className="font-bold">{p.authorName}</span>
                <span className="text-[13px] text-muted">{p.authorHeadline || "Member"} · {when(p.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.body}</p>
              <form action={toggleLikeAction} className="border-t border-line pt-2">
                <input type="hidden" name="postId" value={p.id} />
                <button aria-pressed={p.likedByMe} className={`rounded-lg px-3 py-2 text-sm font-semibold ${p.likedByMe ? "bg-brand-soft text-brand-dark" : "text-[#3d4842] hover:bg-ground"}`}>
                  {p.likedByMe ? "♥ Liked" : "♡ Like"} · {p.likes}
                </button>
              </form>
            </article>
          ))}
        </main>
        <aside className="card flex flex-[1_1_260px] flex-col gap-3 p-4">
          <h2 className="font-bold">Invitations</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-muted">No pending invitations.</p>
          ) : (
            invites.map((i) => (
              <div key={i.id} className="text-sm">
                <span className="font-semibold">{i.name}</span>
                <span className="text-muted"> · {i.headline || "Member"}</span>
              </div>
            ))
          )}
          <Link href="/connect/setup" className="text-sm font-semibold text-brand hover:underline">Edit my Connect profile</Link>
        </aside>
      </div>
    </div>
  );
}
