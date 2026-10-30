import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { getMemberProfile } from "@/modules/connect/service";
import { Logo } from "@/components/brand";
import { saveConnectProfileAction } from "@/app/app/actions";

export default async function ConnectSetupPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  if (!me.emailVerified) redirect("/check-email");
  const profile = await getMemberProfile(me.id);

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-6 py-10">
      <Logo href="/app" />
      <div className="flex w-full max-w-[720px] flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-brand">FREE ACCOUNT</span>
        <h1 className="text-[30px] font-bold">Your Connect profile</h1>
        <p className="text-[15px] text-muted">This is what other members see when you connect, post or comment.</p>
      </div>
      <form action={saveConnectProfileAction} className="card flex w-full max-w-[720px] flex-col gap-5 p-7">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="headline" className="label">Headline</label>
          <input id="headline" name="headline" maxLength={160} defaultValue={profile?.headline} className="input" placeholder="Product manager · interested in workplace wellbeing" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className="label">City</label>
          <input id="city" name="city" maxLength={80} defaultValue={profile?.city} className="input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="topics" className="label">Topics you care about <span className="font-medium text-muted">(comma separated)</span></label>
          <input id="topics" name="topics" defaultValue={profile?.topics.join(", ")} className="input" placeholder="Mindfulness, Leadership, Workplace wellbeing" />
        </div>
        <p className="text-sm text-muted">By default only your connections can message you. You can change this later.</p>
        <button className="btn-primary self-end">Save and go to my feed</button>
      </form>
    </div>
  );
}
