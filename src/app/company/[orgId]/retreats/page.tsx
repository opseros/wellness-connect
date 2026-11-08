import type { Metadata } from "next";
import Link from "next/link";
import { Flash, PageTitle } from "@/components/ui";
import { listDirectory } from "@/modules/listings/service";
import { STAY_STATUS_LABEL, companyRetreats } from "@/modules/stays/service";
import { getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Team retreats" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function TeamRetreats({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const { me, org } = await getBuyerOrExit(orgId);
  const [requests, homes, sp] = await Promise.all([companyRetreats(me.id, orgId), listDirectory("homestay"), searchParams]);
  const groupReady = [...homes].sort((a, b) => (b.listing.rooms ?? 0) - (a.listing.rooms ?? 0)).slice(0, 9);
  return (
    <>
      <PageTitle title="Team retreats" subtitle={`Book a verified homestay for an offsite. The host accepts each request; the stay is invoiced to ${org.name}.`} />
      <Flash msg={sp.msg} error={sp.error} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Your requests</h2>
        {requests.length === 0 ? (
          <p className="card p-5 text-sm text-muted">No retreats yet. Pick a homestay below; check dates and send a request.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{r.homestay?.name ?? "Homestay"}</span>
                  <span className="text-muted">{day(r.checkIn)} to {day(r.checkOut)} · {r.guests} guests · {r.rooms} rooms</span>
                </span>
                <span className="flex items-center gap-3">
                  <b className="tabular-nums">{rs(r.totalPaise)}</b>
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${r.status === "confirmed" ? "bg-brand-soft text-brand-dark" : ["requested", "accepted"].includes(r.status) ? "bg-meetup text-meetup-ink" : "bg-ground text-muted"}`}>{STAY_STATUS_LABEL[r.status as keyof typeof STAY_STATUS_LABEL] ?? r.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Homestays for groups</h2>
        {groupReady.length === 0 ? (
          <p className="card p-5 text-sm text-muted">No homestays listed yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {groupReady.map(({ listing: l, name, slug, photoId }) => (
              <li key={slug} className="card flex min-w-0 flex-col gap-3 p-4">
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#e4f1ea_0%,#eef4ec_55%,#f6efe0_100%)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photoId && <img src={`/media/listing-photos/${photoId}`} alt="" className="size-full object-cover" />}
                  <span className="absolute top-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-0.5 text-[12px] font-semibold">{[l.area, l.city].filter(Boolean).join(", ")}</span>
                </div>
                <span className="font-bold">{name}</span>
                <span className="text-[13px] text-muted">{l.rooms ? `${l.rooms} rooms` : ""}{l.priceFromPaise ? ` · from ${rs(l.priceFromPaise)} a room a night` : ""}</span>
                <Link href={`/homestays/${slug}?for=${orgId}#book-h`} className="btn-primary mt-auto min-h-10 rounded-full text-sm">Plan a retreat here</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
