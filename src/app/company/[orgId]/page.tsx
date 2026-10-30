import Link from "next/link";
import { companyDashboard } from "@/modules/marketplace/service";
import { Badge, Flash, PageTitle } from "@/components/ui";
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

  const d = await companyDashboard(me.id, orgId);
  const stats = [
    { label: "Open requirements", value: d.stats.openRequirements, note: d.stats.drafts ? `${d.stats.drafts} draft${d.stats.drafts === 1 ? "" : "s"}` : null },
    { label: "Proposals to review", value: d.stats.proposalsToReview, note: null },
    { label: "Upcoming sessions", value: d.stats.upcomingSessions, note: null },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title={`${greeting()}, ${me.name.split(" ")[0]}`} subtitle="Here's where your wellness programs stand." />
        <Link href={`${base}/requirements/new`} className="btn-primary">+ New requirement</Link>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex flex-col gap-1 p-5">
            <span className="text-sm text-muted">{s.label}</span>
            <span className="text-[28px] font-bold">{s.value}</span>
            {s.note && <span className="text-[13px] text-muted">{s.note}</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="card min-w-0 flex-[999_1_560px] overflow-x-auto">
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

        <section className="card flex flex-[1_1_300px] flex-col gap-3 p-5">
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
