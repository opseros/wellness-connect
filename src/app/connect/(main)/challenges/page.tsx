import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/identity/session";
import { istToday, listChallenges } from "@/modules/connect/challenges";
import { ChallengeLink, GroupLine, JoinButton, QuickLog, Ring, StateChip, range, unitText } from "../../challenge-ui";
import { Flash } from "../../ui";

export const metadata: Metadata = { title: "Challenges" };

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [all, sp] = await Promise.all([listChallenges(me.id), searchParams]);
  const today = istToday();
  const mine = all.filter((c) => c.joined && c.state !== "ended");
  const open = all.filter((c) => !c.joined && c.state !== "ended");
  const ended = all.filter((c) => c.state === "ended");

  return (
    <main className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#e4f1ea_0%,#eef4ec_55%,#f6efe0_100%)] px-6 py-7 ring-1 ring-[#0f6b5c]/10 sm:px-8">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-brand">Challenges</p>
        <h1 className="mt-1.5 max-w-[560px] font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-[#10231c] sm:text-[36px]">Small goals, done together.</h1>
        <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-[#33433b]">
          Join a challenge, log a number each day, and watch the group total grow. Only you see your numbers; there&apos;s no leaderboard.
        </p>
      </header>

      <Flash msg={sp.msg} error={sp.error} />

      {mine.length > 0 && (
        <section aria-labelledby="mine-h" className="flex flex-col gap-3">
          <h2 id="mine-h" className="font-display text-[20px] font-bold">Your challenges</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {mine.map((c) => (
              <li key={c.id} className="card flex min-w-0 flex-col gap-4 p-5">
                <div className="flex items-center gap-4">
                  <Ring value={c.myTotal} goal={c.goal} done={c.completed} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <StateChip c={c} />
                      {c.company && <span className="rounded-full bg-[#e3ecf5] px-2.5 py-0.5 text-[12px] font-semibold text-[#1d4f7a]">Your company</span>}
                    </span>
                    <ChallengeLink c={c} className="truncate font-display text-[18px] font-bold hover:underline">{c.title}</ChallengeLink>
                    <span className="text-[14px] text-[#3d4842]">
                      <b className="text-ink">{unitText(c, c.myTotal)}</b> of {unitText(c, c.goal)}
                      {c.completed && <span className="ml-1.5 font-semibold text-[#9b5a00]">· goal reached</span>}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <QuickLog c={c} today={today} back="/connect/challenges" current={c.myToday} />
                  <ChallengeLink c={c} className="text-[13.5px] font-semibold text-brand hover:underline">Details →</ChallengeLink>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="open-h" className="flex flex-col gap-3">
        <h2 id="open-h" className="font-display text-[20px] font-bold">{mine.length ? "More to join" : "Join a challenge"}</h2>
        {open.length === 0 ? (
          <p className="card p-5 text-sm text-muted">No open challenges right now. New ones start most Mondays; your company can also set one up for its team.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {open.map((c) => (
              <li key={c.id} className="card flex min-w-0 flex-col gap-3 p-5">
                <span className="flex flex-wrap items-center gap-2">
                  <StateChip c={c} />
                  {c.company && <span className="rounded-full bg-[#e3ecf5] px-2.5 py-0.5 text-[12px] font-semibold text-[#1d4f7a]">Your company</span>}
                </span>
                <ChallengeLink c={c} className="font-display text-[19px] font-bold leading-tight hover:underline">{c.title}</ChallengeLink>
                {c.about && <p className="line-clamp-2 text-[14.5px] text-[#3d4842]">{c.about}</p>}
                <p className="text-[13.5px] text-muted">
                  Goal {unitText(c, c.goal)} · {range(c)}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px] text-muted">
                  <GroupLine c={c} />
                  <JoinButton c={c} back="/connect/challenges" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ended.length > 0 && (
        <section aria-labelledby="ended-h" className="flex flex-col gap-2">
          <h2 id="ended-h" className="text-[16px] font-bold text-muted">Recently ended</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {ended.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <ChallengeLink c={c} className="font-semibold hover:underline">{c.title}</ChallengeLink>
                <span className="text-muted">{c.joined ? (c.completed ? "You reached the goal" : `You logged ${unitText(c, c.myTotal)}`) : range(c)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
