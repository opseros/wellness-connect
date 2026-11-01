import Link from "next/link";
import { getStaffOrExit, when } from "../staff";
import { listOrganizations, staffSeesHospitals, type OrgFilter } from "@/modules/admin/service";
import { STATUS_LABEL } from "@/modules/listings/service";
import { Badge, Flash, PageTitle, Table, Tabs } from "../ui";

const filters: { key: OrgFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "removed", label: "Removed" },
  { key: "all", label: "All" },
];

const GROUPS = [
  { kind: "company", title: "Companies", line: "Book wellness programmes for their teams.", review: null },
  { kind: "homestay", title: "Homestays", line: "Host guests for rest, recovery and retreats.", review: "/admin/homestays" },
  { kind: "facility", title: "Gyms, studios and wellness centres", line: "Places to move, stretch and recharge.", review: "/admin/facilities" },
  { kind: "hospital", title: "Hospitals", line: "Care & Travel: receive patients who travel for treatment.", review: "/admin/hospitals" },
] as const;

type Row = Awaited<ReturnType<typeof listOrganizations>>[number];

function Standing({ o }: { o: Row }) {
  return o.removedAt ? <Badge status="removed" /> : o.suspendedAt ? <Badge status="suspended" /> : <Badge status="active" />;
}

/** Companies, homestays and hospitals in separate cards, each with a link to edit, suspend or remove. */
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filter = filters.find((f) => f.key === sp.filter)?.key ?? "active";
  const [all, showHospitals] = await Promise.all([listOrganizations(me, q, filter), staffSeesHospitals(me)]);
  const rows = showHospitals ? all : all.filter((r) => r.kind !== "hospital");
  const groups = GROUPS.filter((g) => showHospitals || g.kind !== "hospital");
  const href = (f: OrgFilter) => `/admin/organizations?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageTitle title="Organizations" subtitle={q ? `${rows.length} matching "${q}"` : "Companies, homestays and hospitals, newest first"} />
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs current={filter} items={filters.map((f) => ({ key: f.key, label: f.label, href: href(f.key) }))} />
      <form action="/admin/organizations" className="flex max-w-xl gap-2">
        <input type="hidden" name="filter" value={filter} />
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name, domain or city" className="input" />
        <button className="btn-outline">Search</button>
      </form>
      <nav aria-label="Jump to" className="flex flex-wrap gap-2 text-sm font-semibold">
        {groups.map((g) => (
          <a key={g.kind} href={`#${g.kind}`} className="rounded-full border border-line bg-white px-3.5 py-1.5 hover:border-brand">
            {g.title} <span className="text-muted">{rows.filter((r) => r.kind === g.kind).length}</span>
          </a>
        ))}
      </nav>

      {groups.map((g) => {
        const list = rows.filter((r) => r.kind === g.kind);
        return (
          <section key={g.kind} id={g.kind} aria-labelledby={`${g.kind}-h`} className="card flex scroll-mt-6 flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id={`${g.kind}-h`} className="text-[19px] font-bold">{g.title} <span className="font-normal text-muted">· {list.length}</span></h2>
                <p className="text-sm text-muted">{g.line}</p>
              </div>
              {g.review && <Link href={g.review} className="text-sm font-semibold text-brand hover:underline">Verification queue →</Link>}
            </div>
            <Table
              head={g.kind === "company" ? ["Company", "Members", "Email domain", "Standing", "Created", ""] : ["Name", "City", "Team", "Verification", "Standing", ""]}
              empty={list.length === 0 && `No ${g.title.toLowerCase()} here.`}
            >
              {list.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/organizations/${o.id}`} className="font-semibold text-brand hover:underline">{o.name}</Link></td>
                  {g.kind === "company" ? (
                    <>
                      <td>
                        {o.activeMembers} active
                        {o.pendingMembers > 0 && <span className="ml-2"><Badge status="pending" label={`${o.pendingMembers} pending`} /></span>}
                      </td>
                      <td>{o.domain ?? "—"}{o.domain && <span className="block text-xs text-muted">{o.domainVerifiedAt ? "Verified" : "Not verified"}</span>}</td>
                      <td><Standing o={o} /></td>
                      <td className="whitespace-nowrap">{when(o.createdAt)}</td>
                    </>
                  ) : (
                    <>
                      <td>{o.city || "—"}</td>
                      <td>{o.activeMembers}</td>
                      <td>{o.listingStatus ? <Badge status={o.listingStatus} label={STATUS_LABEL[o.listingStatus]} /> : "—"}</td>
                      <td><Standing o={o} /></td>
                    </>
                  )}
                  <td className="text-right"><Link href={`/admin/organizations/${o.id}`} className="font-semibold text-brand hover:underline">Manage</Link></td>
                </tr>
              ))}
            </Table>
          </section>
        );
      })}
    </>
  );
}
