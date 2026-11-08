import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/modules/identity/session";
import { PLUS_PERKS, plusFor } from "@/modules/platform/plus";
import { plusWaitlistAction } from "./actions";

export const metadata: Metadata = { title: "Moosam Plus" };

export default async function PlusPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = (await getCurrentUser())!;
  const [plus, sp] = await Promise.all([plusFor(me.id), searchParams]);
  if (!plus) notFound();
  return (
    <>
      {plus.preview && <p className="rounded-xl bg-[#fff4dc] px-4 py-3 text-sm text-[#7a4b00]">Preview: Moosam Plus is switched off, so only super admins can see this page. Switch it on in Admin → Settings.</p>}
      <Flash msg={sp.msg} />
      <section className="grid items-start gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-[24px] bg-[linear-gradient(135deg,#e4f1ea_0%,#eef4ec_55%,#f6efe0_100%)] p-7 ring-1 ring-[#0f6b5c]/10">
          <span className="w-fit rounded-full bg-white/80 px-3 py-1 text-[12px] font-bold tracking-[0.14em] text-brand uppercase">Optional</span>
          <h1 className="font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em]">Moosam Plus</h1>
          <p className="max-w-[52ch] text-[15.5px] text-[#33433b]">Connect, circles, challenges and buddy match stay free for everyone. Plus is for members who want a little more.</p>
          <ul className="flex flex-col gap-2">
            {PLUS_PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[15px] font-semibold">
                <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="card flex flex-col gap-3 p-6">
          <span className="font-display text-[34px] leading-none font-extrabold">₹{(plus.pricePaise / 100).toLocaleString("en-IN")}<span className="text-base font-semibold text-muted"> a month</span></span>
          <p className="text-sm text-muted">Card and UPI payments open soon. Join the waitlist and we&apos;ll email you the day Plus starts; you won&apos;t be charged until you sign up.</p>
          <form action={plusWaitlistAction}>
            <input type="hidden" name="join" value={plus.joined ? "0" : "1"} />
            <button className={plus.joined ? "btn-outline w-full" : "btn-primary w-full"}>{plus.joined ? "Leave the waitlist" : "Join the waitlist"}</button>
          </form>
          {plus.joined && <p className="text-[13px] font-semibold text-brand-dark">You&apos;re on the list.</p>}
        </div>
      </section>
    </>
  );
}
