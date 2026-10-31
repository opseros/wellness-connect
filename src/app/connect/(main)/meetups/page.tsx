import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/identity/session";
import { commentsForPosts, getMemberProfile, listUpcomingMeetups } from "@/modules/connect/service";
import { Composer } from "../../composer";
import { Flash, PostCard } from "../../ui";

export const metadata: Metadata = { title: "Meet-ups" };

export default async function Meetups({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [rows, profile, sp] = await Promise.all([listUpcomingMeetups(me.id), getMemberProfile(me.id), searchParams]);
  const comments = await commentsForPosts(me.id, rows.map((p) => p.id));
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Meet-ups</h1>
        <p className="text-[15px] text-muted">Upcoming walks, runs and get-togethers from your network, your groups{profile?.city ? ` and ${profile.city}` : ""}.</p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <Composer back="/connect/meetups" city={profile?.city} />
      {rows.length === 0 && <p className="card p-6 text-[15px] text-muted">No upcoming meet-ups yet. Plan one: choose Meet-up above.</p>}
      {rows.map((p) => <PostCard key={p.id} p={p} me={me.id} back="/connect/meetups" comments={comments.get(p.id) ?? []} />)}
    </>
  );
}
