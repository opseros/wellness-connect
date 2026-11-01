import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { AMENITY_LABEL, FACILITY_TYPE_LABEL, FEATURE_LABEL, getPublicListing, SERVES_LABEL } from "@/modules/listings/service";
import { DirectoryShell, rupees } from "./directory";
import { StayBooking, type StaySearch } from "./stay-booking";
import { POLICY_TEXT, type CancellationPolicy } from "@/modules/stays/policy";
import { careTravelEnabled, listPublicPackages } from "@/modules/care/service";

/** Public page for one verified homestay, hospital or facility (team members can preview before verification). */
export async function ListingDetail({ kind, slug, sp = {} }: { kind: "homestay" | "hospital" | "facility"; slug: string; sp?: StaySearch }) {
  const me = await getCurrentUser();
  const d = await getPublicListing(me?.id ?? null, kind, slug).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const l = d.listing;
  const homestay = kind === "homestay";
  const facility = kind === "facility";
  const hospital = kind === "hospital";
  const packages = hospital ? await listPublicPackages(d.orgId) : [];
  const quoteHref = `/care/request?hospital=${d.orgId}`;
  const back = { homestay: "/homestays", hospital: "/hospitals", facility: "/facilities" }[kind];
  const facts: [string, string][] = facility
    ? [
        ["What's here", l.facilityTypes.map((t) => FACILITY_TYPE_LABEL[t as keyof typeof FACILITY_TYPE_LABEL] ?? t).join(", ")],
        ["Membership from", l.membershipFromPaise !== null ? `${rupees(l.membershipFromPaise)} a month` : ""],
        ["Drop-in or single class", l.dropInPaise !== null ? rupees(l.dropInPaise) : ""],
        ["Opening hours", l.openingHours],
        ["Languages", l.languages.join(", ")],
      ]
    : homestay
    ? [
        ["Rooms", l.rooms ? `${l.rooms}${l.maxGuests ? ` · up to ${l.maxGuests} guests` : ""}` : ""],
        ["Price from", l.priceFromPaise !== null ? `${rupees(l.priceFromPaise)} a night` : ""],
        ["Languages", l.languages.join(", ")],
        ["Check-in / check-out", `From ${l.checkInTime} · by ${l.checkOutTime}`],
        ["Cancellation", POLICY_TEXT[l.cancellationPolicy as CancellationPolicy]?.name ?? ""],
      ]
    : [
        ["Specialties", l.specialties.join(", ")],
        ["Patients", SERVES_LABEL[l.serves]],
        ["International desk", l.internationalDesk ? `Yes${l.visaLetter ? ", including medical visa letters" : ""}` : ""],
        ["Beds", l.beds ? String(l.beds) : ""],
        ["Languages", l.languages.join(", ")],
      ];
  return (
    <DirectoryShell>
      <Link href={back} className="text-sm font-semibold text-brand hover:underline">← All {{ homestay: "homestays", hospital: "hospitals", facility: "gyms, studios and wellness centres" }[kind]}</Link>
      {!d.isPublic && (
        <p role="status" className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
          Preview: only your team can see this until our verification team approves it. <Link href={`/listing/${d.orgId}`} className="font-semibold underline">Back to your workspace</Link>
        </p>
      )}
      <section className="flex flex-col gap-2">
        <span className="flex flex-wrap gap-2">
          {d.isPublic && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">Verified by our team</span>}
          {facility && l.freeTrial && <span className="rounded-full bg-meetup px-2.5 py-1 text-xs font-bold text-meetup-ink">Free trial</span>}
          {facility && l.corporatePlans && <span className="rounded-full bg-career px-2.5 py-1 text-xs font-bold text-career-ink">Corporate memberships</span>}
          {l.accreditations.map((a) => <span key={a} className="rounded-full bg-travel px-2.5 py-1 text-xs font-bold text-travel-ink">{a} accredited</span>)}
        </span>
        <h1 className="font-display text-[34px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[44px]">{d.name}</h1>
        <p className="text-[16px] text-muted">{[l.area, l.city, l.state].filter(Boolean).join(", ")}</p>
        {l.tagline && <p className="text-[18px]">{l.tagline}</p>}
      </section>
      {d.photos.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {d.photos.map((p, i) => (
            <li key={p.id} className={i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served through the access-checked route */}
              <img src={`/media/listing-photos/${p.id}`} alt={p.caption || `${d.name}, photo ${i + 1}`} className="h-full w-full rounded-2xl object-cover" style={{ aspectRatio: "4 / 3" }} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <h2 className="text-lg font-bold">About</h2>
          <p className="whitespace-pre-line text-[15.5px] leading-relaxed">{l.about}</p>
          {homestay && l.features.length > 0 && (
            <>
              <h2 className="text-lg font-bold">What&apos;s here</h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {l.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[15px]"><span aria-hidden className="text-brand">✓</span>{FEATURE_LABEL[f as keyof typeof FEATURE_LABEL]}</li>
                ))}
              </ul>
            </>
          )}
          {facility && l.amenities.length > 0 && (
            <>
              <h2 className="text-lg font-bold">Amenities</h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {l.amenities.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[15px]"><span aria-hidden className="text-brand">✓</span>{AMENITY_LABEL[f as keyof typeof AMENITY_LABEL] ?? f}</li>
                ))}
              </ul>
            </>
          )}
          {hospital && packages.length > 0 && (
            <>
              <h2 className="text-lg font-bold">Treatment packages</h2>
              <ul className="flex flex-col gap-3">
                {packages.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
                    <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold">{p.title}</span><span className="font-bold">{rupees(p.priceMinPaise)}–{rupees(p.priceMaxPaise)}</span></span>
                    <span className="text-[13.5px] text-muted">{p.specialty}{p.hospitalNights ? ` · ${p.hospitalNights} nights in hospital` : ""}{p.recoveryNights ? ` · about ${p.recoveryNights} nights' recovery nearby` : ""}{p.forCompanies ? " · for company teams" : ""}</span>
                    {p.includes.length > 0 && <span className="text-[14px]">Includes {p.includes.join(", ")}</span>}
                    {p.description && <span className="text-[14px] text-[#3d4842]">{p.description}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-muted">Indicative prices. The hospital confirms the final price after your consultation; you pay the hospital directly.</p>
            </>
          )}
          {homestay && l.houseRules && (
            <>
              <h2 className="text-lg font-bold">House rules</h2>
              <p className="whitespace-pre-line text-[15px]">{l.houseRules}</p>
            </>
          )}
        </section>
        <aside className="card flex flex-[1_1_300px] flex-col gap-3 p-6">
          <dl className="flex flex-col gap-3 text-[15px]">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
            ))}
          </dl>
          {facility ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {l.website ? (
                <a href={l.website} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary">Visit their website</a>
              ) : (
                <p className="text-[13.5px] text-[#3d4842]">Drop in during opening hours{l.freeTrial ? " and ask for your free trial" : ""}.</p>
              )}
              {l.corporatePlans && <p className="text-[12.5px] text-muted">Offers memberships for company teams. Ask about corporate rates.</p>}
            </div>
          ) : homestay ? (
            d.isPublic ? (
              <div className="border-t border-line pt-4"><StayBooking orgId={d.orgId} slug={d.slug} sp={sp} minNights={l.minNights} maxRooms={l.rooms ?? 1} /></div>
            ) : null
          ) : (
            careTravelEnabled() && d.isPublic ? (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <Link href={quoteHref} className="btn-primary">Request a quote</Link>
                <p className="text-[12.5px] text-muted">Free. Ask up to three hospitals; they don&apos;t see your name until you accept a quote, and you don&apos;t need to share reports.</p>
              </div>
            ) : (
              <p className="rounded-xl bg-ground px-4 py-3 text-[13.5px] text-[#3d4842]">Quote requests open soon. You&apos;ll be able to ask for a quote without sharing medical records.</p>
            )
          )}
          {hospital && <p className="text-[12.5px] text-muted">Not medical advice. Talk to a qualified doctor about your treatment.</p>}
        </aside>
      </div>
    </DirectoryShell>
  );
}
