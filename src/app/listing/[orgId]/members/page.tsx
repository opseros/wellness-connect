import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/identity/session";
import { facilityMembers } from "@/modules/listings/plans";

export const metadata: Metadata = { title: "Members" };
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const me = (await getCurrentUser())!;
  const { orgId } = await params;
  const rows = await facilityMembers(me.id, orgId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">Members</h1>
        <p className="text-muted">People who bought a plan on Moosam. Check names at the front desk.</p>
      </div>
      {rows.length === 0 ? (
        <p className="card p-5 text-sm text-muted">No plans sold yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
          <table className="w-full text-sm">
            <thead><tr className="bg-ground text-left text-[12px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">Member</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Valid</th><th className="px-4 py-2.5">Paid with</th><th className="px-4 py-2.5 text-right">Price</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3">{r.planName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{day(r.startsOn)} to {day(r.endsOn)} {r.endsOn < today && <span className="ml-1 text-[12px] text-muted">(ended)</span>}</td>
                  <td className="px-4 py-3">{r.paidWith === "credits" ? "Company credits" : "Card / UPI"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{rs(r.pricePaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
