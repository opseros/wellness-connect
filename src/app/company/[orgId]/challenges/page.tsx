import type { Metadata } from "next";
import { Flash, PageTitle } from "@/components/ui";
import { ChallengeForm } from "@/components/challenge-form";
import { companyChallenges, istToday, MIN_GROUP, UNIT_LABEL } from "@/modules/connect/challenges";
import { archiveChallengeAction, createChallengeAction } from "../../actions";
import { getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Challenges" };

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function CompanyChallenges({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const { me, org } = await getBuyerOrExit(orgId);
  const [rows, sp] = await Promise.all([companyChallenges(me.id, orgId), searchParams]);
  return (
    <>
      <PageTitle title="Team challenges" subtitle={`Set a goal for everyone at ${org.name}. Members join from Connect and log their own numbers.`} />
      <Flash msg={sp.msg} error={sp.error} />
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-bold">How privacy works</h2>
        <p className="text-[14.5px] text-[#3d4842]">
          You see how many people joined, the team total and how many reached the goal, once at least {MIN_GROUP} people have joined. You never see anyone&apos;s own numbers, and no health details are collected.
        </p>
      </section>
      {rows.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="card flex flex-col gap-2 p-5">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-brand">{c.state === "live" ? `Live · ${c.daysLeft} days left` : c.state === "upcoming" ? "Starting soon" : "Ended"}</span>
              <h3 className="font-display text-[19px] font-bold">{c.title}</h3>
              <p className="text-[13.5px] text-muted">{day(c.startsOn)} to {day(c.endsOn)} · goal {fmt(c.goal)} {UNIT_LABEL[c.unit].many} each</p>
              <dl className="mt-1 grid grid-cols-3 gap-2 rounded-2xl bg-ground p-3 text-center">
                <div><dt className="text-[12px] text-muted">Joined</dt><dd className="font-display text-[20px] font-extrabold">{c.participants}</dd></div>
                <div><dt className="text-[12px] text-muted">Team total</dt><dd className="font-display text-[20px] font-extrabold">{c.together === null ? "—" : fmt(c.together)}</dd></div>
                <div><dt className="text-[12px] text-muted">Reached goal</dt><dd className="font-display text-[20px] font-extrabold">{c.finishers === null ? "—" : c.finishers}</dd></div>
              </dl>
              {c.together === null && <p className="text-[12.5px] text-muted">Totals appear once {MIN_GROUP} people have joined.</p>}
              {c.state !== "ended" && (
                <form action={archiveChallengeAction} className="mt-1">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="challengeId" value={c.id} />
                  <button className="text-[13px] font-semibold text-muted hover:text-ink hover:underline">End and hide this challenge</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <section className="card flex flex-col gap-4 p-6">
        <h2 className="font-display text-[20px] font-bold">Start a challenge</h2>
        <ChallengeForm action={createChallengeAction} hidden={{ orgId }} today={istToday()} />
      </section>
    </>
  );
}
