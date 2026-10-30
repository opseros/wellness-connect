import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { Logo } from "@/components/brand";
import { CompanyForm, ProfessionalForm } from "./forms";
import { BRAND } from "@/lib/brand";

export default async function OnboardingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect("/check-email");
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 px-6 py-12">
      <Logo href="/app" />
      <div className="flex max-w-[1180px] flex-col gap-2 text-center">
        <h1 className="text-[32px] font-bold">How will you use {BRAND.name}?</h1>
        <p className="text-muted">Signed in as {me.email}. Every account includes Connect; you can add another role later.</p>
      </div>
      <div className="grid w-full max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
        <section id="company" className="card flex flex-col gap-4 border-2 border-brand p-7">
          <h2 className="text-xl font-bold">I&apos;m booking for my company</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Post wellness requirements, compare proposals from verified professionals and manage bookings. If your company is
            already here, you joined its queue automatically when you verified your work email.
          </p>
          <CompanyForm />
        </section>
        <section id="professional" className="card flex flex-col gap-4 p-7">
          <h2 className="text-xl font-bold">I&apos;m a wellness professional</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Create your profile, upload credentials for verification, list services and answer company enquiries.
          </p>
          <ProfessionalForm />
        </section>
        <section className="card flex flex-col gap-4 p-7">
          <h2 className="text-xl font-bold">Just here to connect</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Free for any professional. Build a profile, connect with peers, follow wellness experts and join conversations.
          </p>
          <p className="rounded-lg bg-ground px-3.5 py-3 text-sm text-muted">Always free. No company or credentials needed.</p>
          <Link href="/connect/setup" className="btn-primary mt-auto">Join Connect for free</Link>
        </section>
      </div>
    </div>
  );
}
