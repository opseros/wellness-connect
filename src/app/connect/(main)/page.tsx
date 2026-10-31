import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { commentsForPosts, getFeed, getMemberProfile, listInvitations, suggestMembers } from "@/modules/connect/service";
import { connectAction, respondAction } from "../actions";
import { Composer } from "../composer";
import { Avatar, Flash, PostCard } from "../ui";

export default async function ConnectFeed({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [feed, invites, suggestions, profile, sp] = await Promise.all([getFeed(me.id), listInvitations(me.id), suggestMembers(me.id, 5), getMemberProfile(me.id), searchParams]);
  const comments = await commentsForPosts(me.id, feed.map((p) => p.id));

  return (
    <div className="flex flex-wrap items-start gap-5">
      <main className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
        <h1 className="sr-only">Feed</h1>
        <Flash msg={sp.msg} error={sp.error} />
        <Composer back="/connect" city={profile?.city} />
        {feed.length === 0 && (
          <div className="card flex flex-col items-start gap-3 p-6">
            <p className="text-[15px] text-muted">Your feed is empty. Join a space or connect with people to see their posts here.</p>
            <Link href="/connect/groups" className="btn-primary">Explore spaces</Link>
          </div>
        )}
        {feed.map((p) => (
          <PostCard key={p.id} p={p} me={me.id} back="/connect" comments={comments.get(p.id) ?? []} />
        ))}
      </main>
      <aside className="flex flex-[1_1_260px] flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-bold">Invitations</h2>
          {invites.length === 0 ? (
            <p className="text-sm text-muted">No pending invitations.</p>
          ) : (
            invites.slice(0, 4).map((i) => (
              <div key={i.id} className="flex flex-col gap-2">
                <Link href={`/connect/members/${i.fromUserId}`} className="flex items-center gap-2.5">
                  <Avatar name={i.name} size={34} />
                  <span className="flex min-w-0 flex-col text-sm">
                    <span className="font-semibold">{i.name}</span>
                    <span className="truncate text-muted">{i.headline || "Member"}</span>
                  </span>
                </Link>
                <div className="flex gap-2">
                  <form action={respondAction}>
                    <input type="hidden" name="connectionId" value={i.id} />
                    <input type="hidden" name="accept" value="1" />
                    <button className="btn-primary min-h-9 px-4 text-sm">Accept</button>
                  </form>
                  <form action={respondAction}>
                    <input type="hidden" name="connectionId" value={i.id} />
                    <input type="hidden" name="accept" value="0" />
                    <button className="btn-outline min-h-9 px-4 text-sm">Ignore</button>
                  </form>
                </div>
              </div>
            ))
          )}
          {invites.length > 4 && <Link href="/connect/network" className="text-sm font-semibold text-brand hover:underline">All {invites.length} invitations</Link>}
        </section>
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-bold">People you may know</h2>
          {suggestions.length === 0 && <p className="text-sm text-muted">Add interests and your city to <Link href="/connect/setup" className="text-brand underline">your profile</Link> for better suggestions.</p>}
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <Link href={`/connect/members/${s.id}`} className="flex min-w-0 items-center gap-2.5">
                <Avatar name={s.name} size={34} />
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="font-semibold">{s.name}</span>
                  <span className="truncate text-[12.5px] text-muted">{s.reason}</span>
                </span>
              </Link>
              <form action={connectAction}>
                <input type="hidden" name="userId" value={s.id} />
                <button className="btn-outline min-h-9 px-3 text-sm">Connect</button>
              </form>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}
