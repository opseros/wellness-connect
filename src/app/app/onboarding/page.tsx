import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { Logo } from "@/components/brand";
import { BRAND } from "@/lib/brand";
import { JoinAs, type JoinKind } from "./join-as";

const KINDS: JoinKind[] = ["member", "pro", "company", "homestay", "hospital"];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect("/check-email");
  const as = (await searchParams).as;
  const initial = KINDS.find((k) => k === as) ?? "member";
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 px-4 py-10 sm:px-6">
      <Logo href="/app" />
      <div className="flex max-w-[760px] flex-col gap-2 text-center">
        <h1 className="font-display text-[32px] font-extrabold sm:text-[40px]">How will you use {BRAND.name}?</h1>
        <p className="text-muted">Signed in as {me.email}. Everyone starts with one free personal account; you can add the others later from the same account.</p>
      </div>
      <JoinAs initial={initial} />
    </div>
  );
}
