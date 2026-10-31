import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { commentsForPosts, getMemberPage } from "@/modules/connect/service";
import { blockAction, connectAction, followAction, removeConnectionAction, respondAction } from "../../../actions";
import { listInvitations } from "@/modules/connect/service";
import { Avatar, Flash, PostCard, ReportForm } from "../../../ui";

export const metadata: Metadata = { title: "Member" };

export default async function Member({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ userId }, sp] = await Promise.all([params, searchParams]);
  const m = await getMemberPage(me.id, userId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const here = `/connect/members/${m.id}`;
  const back = <input type="hidden" name="back" value={here} />;
  const invite = m.state === "received" ? (await listInvitations(me.id)).find((i) => i.fromUserId === m.id) : undefined;
  const comments = await commentsForPosts(me.id, m.posts.map((p) => p.id));

  return (
    <>
      <Flash msg={sp.msg} error={sp.error} />
      <section className="card flex flex-wrap items-start gap-5 p-6">
        <Avatar name={m.name} size={84} />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-extrabold leading-tight">{m.name}</h1>
          <p className="text-[16px]">{m.headline || "Member"}</p>
          <p className="text-sm text-muted">{[m.jobTitle && m.company ? `${m.jobTitle} at ${m.company}` : m.jobTitle || m.company, m.city].filter(Boolean).join(" · ")}</p>
          <p className="text-sm text-muted">{m.connections} connection{m.connections === 1 ? "" : "s"} · {m.followers} follower{m.followers === 1 ? "" : "s"}</p>
          {m.topics.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m.topics.map((t) => <span key={t} className="rounded-full bg-ground px-3 py-1 text-[13px] font-semibold">{t}</span>)}
            </div>
          )}
          {m.professionalProfileId && <Link href={`/p/${m.professionalProfileId}`} className="mt-1 text-sm font-semibold text-brand hover:underline">Verified professional: see services</Link>}
        </div>
        {m.state !== "self" ? (
          <div className="flex flex-wrap items-center gap-2">
            {m.state === "none" && <form action={connectAction}>{back}<input type="hidden" name="userId" value={m.id} /><button className="btn-primary">Connect</button></form>}
            {m.state === "sent" && <form action={removeConnectionAction}>{back}<input type="hidden" name="userId" value={m.id} /><input type="hidden" name="label" value="Request withdrawn." /><button className="btn-outline">Withdraw request</button></form>}
            {m.state === "received" && invite && <form action={respondAction}>{back}<input type="hidden" name="connectionId" value={invite.id} /><input type="hidden" name="accept" value="1" /><button className="btn-primary">Accept request</button></form>}
            {m.canMessage && <Link href={`/connect/messages?to=${m.id}`} className="btn-outline">Message</Link>}
            <form action={followAction}>{back}<input type="hidden" name="userId" value={m.id} /><input type="hidden" name="follow" value={m.following ? "0" : "1"} /><button className="btn-outline">{m.following ? "Following" : "Follow"}</button></form>
            <details className="relative">
              <summary className="btn-outline cursor-pointer list-none" aria-label="More options">More</summary>
              <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-line bg-white p-2 shadow-lg">
                {m.state === "connected" && <form action={removeConnectionAction}>{back}<input type="hidden" name="userId" value={m.id} /><input type="hidden" name="label" value="Connection removed." /><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ground">Remove connection</button></form>}
                <form action={blockAction}><input type="hidden" name="userId" value={m.id} /><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#9b2c1f] hover:bg-ground">Block {m.name.split(" ")[0]}</button></form>
                <ReportForm targetType="user" targetId={m.id} back={here} />
              </div>
            </details>
          </div>
        ) : (
          <Link href="/connect/setup" className="btn-outline">Edit profile</Link>
        )}
      </section>
      {m.limited ? (
        <p className="card p-6 text-[15px] text-muted">{m.name.split(" ")[0]} shares their profile and posts with connections only.</p>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Posts</h2>
          {m.posts.length === 0 && <p className="card p-6 text-[15px] text-muted">No posts yet.</p>}
          {m.posts.map((p) => <PostCard key={p.id} p={p} me={me.id} back={here} comments={comments.get(p.id) ?? []} />)}
        </section>
      )}
    </>
  );
}
