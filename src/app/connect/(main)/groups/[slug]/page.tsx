import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { commentsForPosts, getGroup, getMemberProfile } from "@/modules/connect/service";
import { joinGroupAction, leaveGroupAction, moderateAction } from "../../../actions";
import { Composer } from "../../../composer";
import { Flash, PostCard, ReportForm } from "../../../ui";

export const metadata: Metadata = { title: "Group" };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const d = await getGroup(me.id, slug).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const g = d.group;
  const here = `/connect/groups/${g.slug}`;
  const [comments, profile] = await Promise.all([commentsForPosts(me.id, d.posts.map((p) => p.id)), getMemberProfile(me.id)]);
  const hidden = (
    <>
      <input type="hidden" name="groupId" value={g.id} />
      <input type="hidden" name="back" value={here} />
    </>
  );
  return (
    <>
      <Link href="/connect/groups" className="text-sm font-semibold text-brand hover:underline">← Groups &amp; spaces</Link>
      <Flash msg={sp.msg} error={sp.error} />
      <section className="card flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="font-display text-[30px] font-extrabold leading-tight">{g.name}</h1>
          <p className="text-sm text-muted">{[g.kind === "space" ? "Space" : "Community", g.city, `${d.members} member${d.members === 1 ? "" : "s"}`, g.privacy === "approval" ? "Moderators approve new members" : "Open to all"].filter(Boolean).join(" · ")}</p>
          {g.about && <p className="mt-1 text-[15px] leading-relaxed">{g.about}</p>}
          {d.moderators.length > 0 && <p className="text-[13px] text-muted">Moderators: {d.moderators.map((m) => m.name).join(", ")}</p>}
        </div>
        <div className="flex items-center gap-2">
          {d.isMember ? (
            <form action={leaveGroupAction}>{hidden}<button className="btn-outline">Leave</button></form>
          ) : d.myStatus === "pending" ? (
            <span className="btn-outline pointer-events-none">Request sent</span>
          ) : (
            <form action={joinGroupAction}>{hidden}<input type="hidden" name="approval" value={g.privacy === "approval" ? "1" : "0"} /><button className="btn-primary">{g.privacy === "approval" ? "Ask to join" : "Join"}</button></form>
          )}
          {!d.moderator && <ReportForm targetType="group" targetId={g.id} back={here} />}
        </div>
      </section>

      {d.moderator && d.pending.length > 0 && (
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="font-bold">Requests to join</h2>
          {d.pending.map((p) => (
            <div key={p.userId} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/connect/members/${p.userId}`} className="font-semibold hover:underline">{p.name}</Link>
              <span className="flex gap-2">
                <form action={moderateAction}>{hidden}<input type="hidden" name="userId" value={p.userId} /><input type="hidden" name="action" value="approve" /><button className="btn-primary min-h-9 px-4 text-sm">Approve</button></form>
                <form action={moderateAction}>{hidden}<input type="hidden" name="userId" value={p.userId} /><input type="hidden" name="action" value="decline" /><button className="btn-outline min-h-9 px-4 text-sm">Decline</button></form>
              </span>
            </div>
          ))}
        </section>
      )}

      {d.isMember && <Composer back={here} groupId={g.id} city={g.city || profile?.city} placeholder={`Post in ${g.name}`} />}
      {!d.canSee ? (
        <p className="card p-6 text-[15px] text-muted">Posts in this group are visible to its members.</p>
      ) : d.posts.length === 0 ? (
        <p className="card p-6 text-[15px] text-muted">No posts yet.{d.isMember ? " Start the conversation." : " Join to start the conversation."}</p>
      ) : (
        d.posts.map((p) => <PostCard key={p.id} p={p} me={me.id} back={here} comments={comments.get(p.id) ?? []} canComment={d.isMember} />)
      )}
    </>
  );
}
