import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import {
  commentsForPosts,
  connectSnapshot,
  feedQuery,
  getFeed,
  getMemberProfile,
  listGroups,
  listInvitations,
  listUpcomingMeetups,
  peopleYouMet,
  postableGroups,
  suggestMembers,
  type FeedFilter,
} from "@/modules/connect/service";
import { SPACE_TINT, SpaceIcon, type SpaceKey } from "@/components/landing";
import { myCircles, pendingBuddyCount, syncCircles } from "@/modules/connect/social";
import { istToday, listChallenges } from "@/modules/connect/challenges";
import { ChallengeLink, QuickLog, Ring, unitText } from "../challenge-ui";
import { connectAction, joinGroupAction, respondAction } from "../actions";
import { Composer } from "../composer";
import { Avatar, Flash, PostCard } from "../ui";

const PAGE = 20;

const FILTERS: { key: FeedFilter; label: string; empty: string }[] = [
  { key: "all", label: "All", empty: "Your feed is quiet. Join a space or connect with people to see their posts here." },
  { key: "connections", label: "People", empty: "No posts from your connections or people you follow yet." },
  { key: "spaces", label: "Groups & spaces", empty: "Nothing from your groups and spaces yet. Join a few to fill this up." },
  { key: "meetups", label: "Meet-ups", empty: "No meet-ups from your network yet. Plan one: a walk, a run or chai after work." },
];

const tz = { timeZone: "Asia/Kolkata" } as const;
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...o, ...tz }).format(d);

function RailCard({ title, href, link, children }: { title: string; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        {href && <Link href={href} className="text-[13px] font-semibold text-brand hover:underline">{link ?? "See all"}</Link>}
      </div>
      {children}
    </section>
  );
}

/** The Connect home: what your network is sharing and planning, with a way in for new members. */
export default async function ConnectFeed({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; show?: string; before?: string }> }) {
  const me = (await getCurrentUser())!;
  const sp = await searchParams;
  const q = feedQuery.parse({ show: sp.show, before: sp.before, limit: PAGE });
  // Company circles follow your workplaces (joining or leaving a company).
  await syncCircles(me.id);
  const [feed, invites, suggestions, profile, snap, groups, meetups, allGroups, circles, met, buddySuggestions, challenges] = await Promise.all([
    getFeed(me.id, q),
    listInvitations(me.id),
    suggestMembers(me.id, 4),
    getMemberProfile(me.id),
    connectSnapshot(me.id),
    postableGroups(me.id),
    listUpcomingMeetups(me.id, 3),
    listGroups(me.id),
    myCircles(me.id),
    peopleYouMet(me.id, { onlyNew: true, limit: 3 }),
    pendingBuddyCount(me.id),
    listChallenges(me.id),
  ]);
  const myLive = challenges.filter((c) => c.joined && c.state === "live").slice(0, 2);
  const toJoin = challenges.find((c) => !c.joined && c.state !== "ended");
  const today = istToday();
  const comments = await commentsForPosts(me.id, feed.map((p) => p.id), 2);
  const spacesToJoin = allGroups.filter((g) => g.group.kind === "space" && !g.myStatus).slice(0, 4);
  const filter = FILTERS.find((f) => f.key === q.show)!;
  const href = (show: FeedFilter, before?: Date) => {
    const u = new URLSearchParams();
    if (show !== "all") u.set("show", show);
    if (before) u.set("before", before.toISOString());
    const s = u.toString();
    return s ? `/connect?${s}` : "/connect";
  };
  const back = href(q.show);
  const firstName = me.name.split(" ")[0];

  return (
    <div className="flex flex-wrap items-start gap-5">
      <main className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
        <h1 className="sr-only">Feed</h1>
        <Flash msg={sp.msg} error={sp.error} />

        {snap.done < snap.steps.length && !q.before && (
          <section aria-labelledby="start-h" className="card flex flex-col gap-4 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[linear-gradient(110deg,var(--color-brand-soft),var(--color-meetup))] px-5 py-4">
              <div>
                <h2 id="start-h" className="font-display text-[19px] font-bold">Welcome to Connect, {firstName}</h2>
                <p className="text-[14px] text-[#3d4842]">A few steps and your feed comes alive.</p>
              </div>
              <span className="flex items-center gap-3 text-sm font-semibold">
                {snap.done} of {snap.steps.length}
                <span aria-hidden className="h-2 w-28 overflow-hidden rounded-full bg-white/80">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(snap.done / snap.steps.length) * 100}%` }} />
                </span>
              </span>
            </div>
            <ol className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
              {snap.steps.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] ${s.done ? "text-muted" : "bg-ground font-semibold hover:bg-brand-soft"}`}>
                    <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-brand text-white" : "border-2 border-line bg-white"}`}>
                      {s.done && <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                    </span>
                    <span className={s.done ? "line-through decoration-line" : ""}>{s.label}</span>
                    <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        <Composer back={back} city={profile?.city} groups={groups} me={me.name} placeholder={`What's on your mind, ${firstName}?`} />

        <nav aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              aria-current={f.key === q.show ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f.key === q.show ? "bg-ink text-white" : "border border-line bg-white text-[#3d4842] hover:border-ink"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        {feed.length === 0 && (
          <div className="card flex flex-col items-start gap-3 p-6">
            <p className="text-[15px] text-muted">{q.before ? "You've reached the beginning." : filter.empty}</p>
            <span className="flex flex-wrap gap-2">
              <Link href="/connect/groups" className="btn-primary">Explore spaces</Link>
              <Link href="/connect/network" className="btn-outline">Find people</Link>
            </span>
          </div>
        )}
        {feed.map((p) => (
          <PostCard key={p.id} p={p} me={me.id} back={back} comments={comments.get(p.id) ?? []} />
        ))}
        {feed.length === PAGE && (
          <Link href={href(q.show, feed[feed.length - 1].createdAt)} className="btn-outline self-center rounded-full px-6">Show older posts</Link>
        )}
        {q.before && <Link href={href(q.show)} className="self-center text-sm font-semibold text-brand hover:underline">Back to newest</Link>}
      </main>

      <aside className="flex flex-[1_1_260px] flex-col gap-4 xl:sticky xl:top-4">
        {invites.length > 0 && (
          <RailCard title={`Invitations · ${invites.length}`} href={invites.length > 3 ? "/connect/network" : undefined}>
            {invites.slice(0, 3).map((i) => (
              <div key={i.id} className="flex flex-col gap-2">
                <Link href={`/connect/members/${i.fromUserId}`} className="flex items-center gap-2.5">
                  <Avatar name={i.name} size={36} />
                  <span className="flex min-w-0 flex-col text-sm">
                    <span className="font-semibold">{i.name}</span>
                    <span className="truncate text-muted">{i.headline || "Member"}</span>
                  </span>
                </Link>
                <div className="flex gap-2">
                  <form action={respondAction}>
                    <input type="hidden" name="connectionId" value={i.id} />
                    <input type="hidden" name="accept" value="1" />
                    <button className="btn-primary min-h-9 rounded-full px-4 text-sm">Accept</button>
                  </form>
                  <form action={respondAction}>
                    <input type="hidden" name="connectionId" value={i.id} />
                    <input type="hidden" name="accept" value="0" />
                    <button className="btn-outline min-h-9 rounded-full px-4 text-sm">Ignore</button>
                  </form>
                </div>
              </div>
            ))}
          </RailCard>
        )}

        {(myLive.length > 0 || toJoin) && (
          <RailCard title={myLive.length ? "Your challenges" : "Join a challenge"} href="/connect/challenges">
            {myLive.length ? (
              <ul className="flex flex-col gap-4">
                {myLive.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <Ring value={c.myTotal} goal={c.goal} size={44} done={c.completed} />
                      <span className="flex min-w-0 flex-col text-sm">
                        <ChallengeLink c={c} className="truncate font-semibold hover:underline">{c.title}</ChallengeLink>
                        <span className="text-[12.5px] text-muted">{unitText(c, c.myTotal)} of {unitText(c, c.goal)}</span>
                      </span>
                    </div>
                    <QuickLog c={c} today={today} back={back} current={c.myToday} />
                  </li>
                ))}
              </ul>
            ) : (
              toJoin && (
                <div className="flex flex-col gap-2">
                  <ChallengeLink c={toJoin} className="font-semibold hover:underline">{toJoin.title}</ChallengeLink>
                  <span className="text-[13px] text-muted">Goal {unitText(toJoin, toJoin.goal)} · {toJoin.participants} joined</span>
                  <Link href={`/connect/challenges/${toJoin.slug}`} className="btn-outline min-h-9 w-fit rounded-full px-4 text-sm">Take a look</Link>
                </div>
              )
            )}
          </RailCard>
        )}

        <RailCard title="Your circles" href="/connect/groups#circles" link="All circles">
          {circles.length === 0 ? (
            <p className="text-sm text-muted">Add your city to <Link href="/connect/setup" className="font-semibold text-brand hover:underline">your profile</Link> and you&apos;ll join its circle. Your company&apos;s circle appears once you join it here.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {circles.map((c) => (
                <li key={c.id}>
                  <Link href={`/connect/groups/${c.slug}`} className="-mx-1 flex items-center gap-2.5 rounded-xl p-1 hover:bg-ground">
                    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-extrabold ${c.company ? "bg-[#e3ecf5] text-[#1d4f7a]" : "bg-brand-soft text-brand-dark"}`}>{c.name.charAt(0)}</span>
                    <span className="flex min-w-0 flex-col text-sm">
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className="text-[12.5px] text-muted">
                        {c.members} member{c.members === 1 ? "" : "s"}
                        {c.postsThisWeek ? ` · ${c.postsThisWeek} new this week` : ""}
                        {c.company ? " · private" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </RailCard>

        <section aria-labelledby="buddy-h" className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#e4f1ea_0%,#f6efe0_100%)] p-4 text-ink ring-1 ring-[#0f6b5c]/10">
          <h2 id="buddy-h" className="font-display text-[18px] font-bold">{buddySuggestions ? `${buddySuggestions} buddy suggestion${buddySuggestions === 1 ? "" : "s"}` : "Find a buddy"}</h2>
          <p className="mt-1 text-[13.5px] text-[#33433b]">
            {buddySuggestions ? "People nearby want to walk, run or train at the same time as you." : "Someone to walk, run, train or meditate with, near you and at your times."}
          </p>
          <Link href="/connect/buddies" className="btn mt-3 min-h-10 rounded-full bg-brand px-4 text-sm text-white hover:bg-brand-dark">{buddySuggestions ? "See who" : "Get matched"}</Link>
        </section>

        {met.length > 0 && (
          <RailCard title="People you met">
            <ul className="flex flex-col gap-2.5">
              {met.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2">
                  <Link href={`/connect/members/${m.userId}`} className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={m.name} size={36} />
                    <span className="flex min-w-0 flex-col text-sm">
                      <span className="truncate font-semibold">{m.name}</span>
                      <span className="truncate text-[12.5px] text-muted">At {m.meetupTitle}</span>
                    </span>
                  </Link>
                  {m.state === "none" ? (
                    <form action={connectAction}>
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn-outline min-h-9 rounded-full px-3 text-sm">Connect</button>
                    </form>
                  ) : (
                    <span className="text-[12.5px] text-muted">{m.state === "sent" ? "Requested" : "Wants to connect"}</span>
                  )}
                </li>
              ))}
            </ul>
          </RailCard>
        )}

        <RailCard title="Upcoming meet-ups" href="/connect/meetups">
          {meetups.length === 0 ? (
            <p className="text-sm text-muted">Nothing planned near you yet. <Link href="/connect?show=meetups#compose" className="font-semibold text-brand hover:underline">Plan one</Link></p>
          ) : (
            <ul className="flex flex-col gap-3">
              {meetups.map((m) => {
                const at = new Date(m.eventAt!);
                return (
                  <li key={m.id}>
                    <Link href={`/connect/posts/${m.id}`} className="flex gap-3 rounded-xl p-1 hover:bg-ground">
                      <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-meetup py-1 leading-tight text-meetup-ink">
                        <span className="text-[10px] font-semibold uppercase">{fmt(at, { month: "short" })}</span>
                        <span className="font-display text-[18px] font-extrabold">{fmt(at, { day: "numeric" })}</span>
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] font-semibold">{m.title}</span>
                        <span className="truncate text-[12.5px] text-muted">{fmt(at, { weekday: "short", hour: "numeric", minute: "2-digit" })} · {m.eventCity}</span>
                        <span className="text-[12.5px] text-muted">{m.goingByMe ? "You're going" : `${m.going} going`}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </RailCard>

        <RailCard title="People you may know" href="/connect/network">
          {suggestions.length === 0 && <p className="text-sm text-muted">Add interests and your city to <Link href="/connect/setup" className="text-brand underline">your profile</Link> for better suggestions.</p>}
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <Link href={`/connect/members/${s.id}`} className="flex min-w-0 items-center gap-2.5">
                <Avatar name={s.name} size={36} />
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="truncate text-[12.5px] text-muted">{s.reason}</span>
                </span>
              </Link>
              <form action={connectAction}>
                <input type="hidden" name="userId" value={s.id} />
                <input type="hidden" name="back" value={back} />
                <button className="btn-outline min-h-9 rounded-full px-3 text-sm">Connect</button>
              </form>
            </div>
          ))}
        </RailCard>

        {spacesToJoin.length > 0 && (
          <RailCard title="Spaces to join" href="/connect/groups">
            <ul className="flex flex-col gap-2">
              {spacesToJoin.map(({ group: g, members }) => {
                const key = g.spaceKey as SpaceKey | null;
                return (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <Link href={`/connect/groups/${g.slug}`} className="flex min-w-0 items-center gap-2.5">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${key ? SPACE_TINT[key] : "bg-ground"}`}>{key && <SpaceIcon k={key} className="size-5" />}</span>
                      <span className="flex min-w-0 flex-col text-sm">
                        <span className="truncate font-semibold">{g.name}</span>
                        <span className="text-[12.5px] text-muted">{members} member{members === 1 ? "" : "s"}</span>
                      </span>
                    </Link>
                    <form action={joinGroupAction}>
                      <input type="hidden" name="groupId" value={g.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn-outline min-h-9 rounded-full px-3 text-sm">Join</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </RailCard>
        )}
      </aside>
    </div>
  );
}
