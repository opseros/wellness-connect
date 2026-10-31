import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { FEATURE_LABEL, getPublicListing, SERVES_LABEL } from "@/modules/listings/service";
import { DirectoryShell, rupees } from "./directory";
import { StayBooking, type StaySearch } from "./stay-booking";
import { POLICY_TEXT, type CancellationPolicy } from "@/modules/stays/policy";

/** Public page for one verified homestay or hospital (team members can preview before verification). */
export async function ListingDetail({ kind, slug, sp = {} }: { kind: "homestay" | "hospital"; slug: string; sp?: StaySearch }) {
  const me = await getCurrentUser();
  const d = await getPublicListing(me?.id ?? null, kind, slug).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const l = d.listing;
  const homestay = kind === "homestay";
  const back = homestay ? "/homestays" : "/hospitals";
  const facts: [string, string][] = homestay
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
      <Link href={back} className="text-sm font-semibold text-brand hover:underline">← All {homestay ? "homestays" : "hospitals"}</Link>
      {!d.isPublic && (
        <p role="status" className="rounded-xl bg-[#fbf0dc] px-4 py-3 text-sm text-[#7a4b00]">
          Preview: only your team can see this until our verification team approves it. <Link href={`/listing/${d.orgId}`} className="font-semibold underline">Back to your workspace</Link>
        </p>
      )}
      <section className="flex flex-col gap-2">
        <span className="flex flex-wrap gap-2">
          {d.isPublic && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">Verified by our team</span>}
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
          {homestay ? (
            d.isPublic ? (
              <div className="border-t border-line pt-4"><StayBooking orgId={d.orgId} slug={d.slug} sp={sp} minNights={l.minNights} maxRooms={l.rooms ?? 1} /></div>
            ) : null
          ) : (
            <p className="rounded-xl bg-ground px-4 py-3 text-[13.5px] text-[#3d4842]">Quote requests open soon. You&apos;ll be able to ask for a quote without sharing medical records.</p>
          )}
          {!homestay && <p className="text-[12.5px] text-muted">Not medical advice. Talk to a qualified doctor about your treatment.</p>}
        </aside>
      </div>
    </DirectoryShell>
  );
}
