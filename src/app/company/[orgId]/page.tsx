import Link from "next/link";
import { companyDashboard } from "@/modules/marketplace/service";
import { Badge, Flash, Kpi, PageTitle } from "@/components/ui";
import { companyCredits, periodLabel } from "@/modules/marketplace/credits";
import { formatPaise } from "@/lib/money";
import { dayTime, getCompanyOrExit, MODE_LABEL, REQ_STATUS, ROLE_LABEL } from "./company";

const tone: Record<string, string> = { draft: "pending", published: "active", closed: "submitted", withdrawn: "closed" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function CompanyDashboard({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const [{ me, org, role, isBuyer }, sp] = await Promise.all([getCompanyOrExit(orgId), searchParams]);
  const base = `/company/${orgId}`;

  if (!isBuyer) {
    return (
      <>
        <PageTitle title={org.name} subtitle={`You're a ${ROLE_LABEL[role].toLowerCase()} of this company.`} />
        <p className="card max-w-2xl p-6 text-[15px] text-muted">
          Members can take part in the sessions your company books. To post requirements and book professionals, ask an owner or admin to make you a
          wellness manager. <Link href={`${base}/settings`} className="font-semibold text-brand hover:underline">See who to ask</Link>
        </p>
      </>
    );
  }

  const [d, c] = await Promise.all([companyDashboard(me.id, orgId), companyCredits(me.id, orgId)]);
  const credits = c.policy?.active && c.current ? c.current : null;
  const given = credits?.requiredPaise ?? 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const maxCat = Math.max(1, ...c.categories.map((x) => x.netPaise ?? 0));
  const stats = [
    { label: "Open requirements", value: d.stats.openRequirements, note: d.stats.drafts ? `${d.stats.drafts} draft${d.stats.drafts === 1 ? "" : "s"}` : null },
    { label: "Proposals to review", value: d.stats.proposalsToReview, note: null },
    { label: "Upcoming sessions", value: d.stats.upcomingSessions, note: null },
  ];

  return (
    <>
      <PageTitle
        title="Overview"
        isNew
        subtitle={credits ? `${org.name} · ${periodLabel(c.period)} wellness credits` : `${greeting()}, ${me.name.split(" ")[0]}. Here's where your wellness programmes stand.`}
        actions={
          <>
            <Link href={`${base}/settings`} className="btn-primary">Invite people</Link>
            <Link href={`${base}/requirements/new`} className="btn-outline">+ New requirement</Link>
          </>
        }
      />
      <Flash msg={sp.msg} error={sp.error} />

      {credits ? (
        <>
          <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
            <Kpi label="Enrolled" value={credits.seats} note="people with credits" />
            <Kpi label="Credits given" isNew highlight value={formatPaise(given)} note={`${formatPaise(credits.allowancePaise)} each`} />
            <Kpi label="Credits used" isNew highlight value={formatPaise(c.usedPaise)} note={`${pct(c.usedPaise, given)}% used`} />
            <Kpi label="Active this month" value={c.activePeople} note={`${pct(c.activePeople, credits.seats)}% of enrolled`} />
          </div>
          <div className="grid gap-[14px] md:grid-cols-2">
            <section aria-labelledby="cat-h" className="card flex flex-col gap-3 p-[18px] ring-2 ring-new/40">
              <h2 id="cat-h" className="text-[19px] font-bold">Spend by category <span className="tag-new">New</span></h2>
              {c.categories.map((x) => (
                <div key={x.category} className="flex flex-col gap-1.5">
                  <span className="flex justify-between gap-3 text-[14px]">
                    {x.label}
                    <b className="tabular-nums">{x.netPaise !== null ? formatPaise(x.netPaise) : x.people > 0 ? "Fewer than 3 people" : "—"}</b>
                  </span>
                  <span aria-hidden className="h-2 overflow-hidden rounded-full bg-ground ring-1 ring-line ring-inset">
                    <i className="block h-full rounded-full bg-brand" style={{ width: `${x.netPaise ? Math.max(4, (x.netPaise / maxCat) * 100) : 0}%` }} />
                  </span>
                </div>
              ))}
              <Link href={`${base}/credits`} className="mt-1 text-sm font-semibold text-brand hover:underline">Benefit policy and payments →</Link>
            </section>
            <section aria-labelledby="month-h" className="card flex flex-col p-[18px]">
              <h2 id="month-h" className="pb-2 text-[19px] font-bold">This month</h2>
              <ul className="flex flex-col [&>li]:flex [&>li]:items-center [&>li]:justify-between [&>li]:gap-3 [&>li]:border-t [&>li]:border-line [&>li]:py-2.5 [&>li:first-child]:border-0">
                <li><span>Open requirements</span><b>{d.stats.openRequirements}</b></li>
                <li><span>Proposals to review</span>{d.stats.proposalsToReview ? <Badge status="sent" label={`${d.stats.proposalsToReview} new`} /> : <b>0</b>}</li>
                <li><span>Upcoming sessions</span><b>{d.stats.upcomingSessions}</b></li>
                <li><span>Prepayment</span><Badge status={credits.status === "paid" ? "confirmed" : "pending"} label={credits.status === "paid" ? "Paid" : `Due ${formatPaise(credits.duePaise)}`} /></li>
              </ul>
            </section>
          </div>
          <p className="flex items-start gap-2.5 rounded-[14px] bg-calm px-3.5 py-3 text-[13.5px] text-[#33433b]">
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-[18px] shrink-0 text-calm-ink" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            You see totals by category, shown once 3 or more people have used it, never which employee booked which professional, gym or stay.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[10px] sm:gap-[14px] md:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
            {stats.map((x) => (
              <Kpi key={x.label} label={x.label} value={x.value} note={x.note ?? undefined} />
            ))}
          </div>
          <section className="card flex flex-wrap items-center justify-between gap-3 p-[18px] ring-2 ring-new/40">
            <div className="flex flex-col gap-1">
              <h2 className="text-[19px] font-bold">Wellness credits <span className="tag-new">New</span></h2>
              <p className="text-sm text-muted">Give everyone a monthly allowance for sessions and partner gyms. You see totals only.</p>
            </div>
            <Link href={`${base}/credits`} className="btn-primary">Set up a benefit policy</Link>
          </section>
        </>
      )}

      <div className="grid items-start gap-[14px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0 overflow-x-auto">
          <h2 className="px-5 pt-5 text-lg font-bold">Requirements</h2>
          {d.requirements.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-5">
              <p className="text-[15px] text-muted">Describe what your team needs and we&apos;ll show verified professionals who fit.</p>
              <Link href={`${base}/requirements/new`} className="btn-primary">Post your first requirement</Link>
            </div>
          ) : (
            <table className="mt-2 w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  {["Requirement", "Category", "Status", "Proposals", ""].map((h) => (
                    <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-[#eef1ef] [&_td]:px-5 [&_td]:py-3">
                {d.requirements.slice(0, 8).map(({ requirement: r, categoryName, proposals, toReview, bookingId }) => {
                  const action =
                    r.status === "draft"
                      ? { href: `${base}/requirements/${r.id}/edit`, label: "Continue editing" }
                      : bookingId
                        ? { href: `${base}/bookings/${bookingId}`, label: "View booking" }
                        : proposals > 0
                          ? { href: `${base}/requirements/${r.id}/proposals`, label: "Compare proposals" }
                          : { href: `${base}/requirements/${r.id}`, label: r.status === "published" ? "See matches" : "View" };
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold">
                        <Link href={`${base}/requirements/${r.id}`} className="hover:underline">{r.title}</Link>
                      </td>
                      <td>{categoryName}</td>
                      <td><Badge status={tone[r.status]} label={REQ_STATUS[r.status]} /></td>
                      <td>{r.status === "draft" ? "—" : toReview ? <span className="font-semibold text-brand-dark">{toReview} new</span> : proposals}</td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={action.href} className="font-semibold text-brand hover:underline">{action.label}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {d.requirements.length > 8 && (
            <Link href={`${base}/requirements`} className="block px-5 pb-4 text-sm font-semibold text-brand hover:underline">All requirements →</Link>
          )}
        </section>

        <section className="card flex min-w-0 flex-col gap-3 p-5">
          <h2 className="text-lg font-bold">Upcoming sessions</h2>
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing booked yet. Accepted proposals appear here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.upcoming.map((u) => (
                <li key={u.booking.id}>
                  <Link href={`${base}/bookings/${u.booking.id}`} className="flex flex-col gap-0.5 rounded-xl bg-ground px-4 py-3 hover:bg-brand-soft">
                    <span className="font-semibold">{u.title}</span>
                    <span className="text-[13px] text-muted">
                      {u.name} · {MODE_LABEL[u.deliveryMode]}{u.booking.location ? `, ${u.booking.location}` : ""} · {u.participants} participants
                    </span>
                    <span className="text-[13px] font-semibold text-brand-dark">{dayTime(u.booking.scheduledStart)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
