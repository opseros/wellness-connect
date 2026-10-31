"use client";
import Link from "next/link";
import { useState } from "react";
import { CompanyForm, ListingForm, ProfessionalForm } from "./forms";

export type JoinKind = "member" | "pro" | "company" | "homestay" | "hospital";

const KINDS: Record<JoinKind, { label: string; line: string; tint: string; icon: string; steps: string[]; time: string; verify: string }> = {
  member: {
    label: "Member",
    line: "Connect, join spaces and meet-ups, plan restful trips.",
    tint: "bg-wellness text-wellness-ink",
    icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 19c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5m-2 0c.8-3 2.7-4.5 5-4.5s4.2 1.5 5 4.5",
    steps: ["A short headline and your city", "A few topics you care about", "Join spaces and say hello"],
    time: "About a minute",
    verify: "Members only need a verified email.",
  },
  pro: {
    label: "Professional",
    line: "Coach, nutritionist, physio or therapist offering services.",
    tint: "bg-move text-move-ink",
    icon: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8Z",
    steps: ["Your professional profile", "Services with price ranges in rupees", "Upload a credential for review"],
    time: "About 10 minutes",
    verify: "Our team checks a credential before companies can find you.",
  },
  company: {
    label: "Company",
    line: "Book professionals and programs for your teams.",
    tint: "bg-career text-career-ink",
    icon: "M4 20V9l8-5 8 5v11M9 20v-6h6v6M4 20h16",
    steps: ["Company name; colleagues on your email domain can ask to join", "Billing email and GSTIN for invoices", "Post your first requirement"],
    time: "About 3 minutes",
    verify: "A work email on your company domain links colleagues automatically.",
  },
  homestay: {
    label: "Homestay",
    line: "Host travellers who come to rest, recover or reset.",
    tint: "bg-meetup text-meetup-ink",
    icon: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5",
    steps: ["Your property: rooms, price from, recovery-friendly features", "At least 3 photos", "Registration, owner ID and proof of ownership or lease"],
    time: "About 15 minutes",
    verify: "We check your homestay or tourism registration, the owner's ID and the photos before you appear in the directory.",
  },
  hospital: {
    label: "Hospital",
    line: "Welcome patients who travel to you for care.",
    tint: "bg-travel text-travel-ink",
    icon: "M4 21V5h16v16M9 21v-4h6v4M12 8v5M9.5 10.5h5",
    steps: ["Hospital details, specialties and your international patient desk", "A photo of the hospital", "Registration, an authorisation letter, and NABH/JCI certificates if you have them"],
    time: "About 20 minutes",
    verify: "We verify the registration, the person registering and any accreditation before the profile is public.",
  },
};
const ORDER: JoinKind[] = ["member", "pro", "company", "homestay", "hospital"];

export function JoinAs({ initial }: { initial: JoinKind }) {
  const [kind, setKind] = useState<JoinKind>(initial);
  const k = KINDS[kind];
  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-6">
      <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <legend className="sr-only">Account type</legend>
        {ORDER.map((key) => {
          const c = KINDS[key];
          const on = key === kind;
          return (
            <label
              key={key}
              className={`flex cursor-pointer flex-col gap-2 rounded-[20px] bg-white p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${on ? "border-2 border-brand shadow-[0_12px_30px_-20px_rgba(15,107,92,0.6)]" : "border border-line"}`}
            >
              <input type="radio" name="joinas" value={key} checked={on} onChange={() => setKind(key)} className="sr-only" />
              <span className={`grid size-10 place-items-center rounded-xl ${c.tint}`}>
                <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
              </span>
              <span className="font-display text-[19px] font-bold">{c.label}</span>
              <span className="text-[13.5px] leading-snug text-muted">{c.line}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-start gap-5">
        <section className="card flex min-w-0 flex-[999_1_520px] flex-col gap-5 p-7" aria-live="polite">
          <h2 className="font-display text-[24px] font-bold">{k.label}: what you&apos;ll set up</h2>
          <ol className="flex flex-col gap-2.5">
            {k.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-[15px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-dark">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="border-t border-line pt-5">
            {kind === "member" && <Link href="/connect/setup" className="btn-primary">Set up my Connect profile</Link>}
            {kind === "pro" && <ProfessionalForm />}
            {kind === "company" && <CompanyForm />}
            {(kind === "homestay" || kind === "hospital") && <ListingForm key={kind} kind={kind} />}
          </div>
          <span className="text-[13px] text-muted">{k.time}</span>
        </section>
        <aside className="flex flex-[1_1_300px] flex-col gap-3 rounded-[22px] bg-ink p-6 text-white">
          <h2 className="font-bold">We verify before you appear</h2>
          <p className="text-[14.5px] leading-relaxed text-white/85">{k.verify}</p>
          <p className="rounded-xl bg-white/10 px-4 py-3 text-[13.5px] leading-relaxed text-white/85">
            One person can be a member, a professional and an admin of a company, homestay or hospital, all from one sign-in. Add more any time from Home.
          </p>
        </aside>
      </div>
    </div>
  );
}
