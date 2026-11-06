import { getStaffOrExit } from "../staff";
import { listPlatformChallenges } from "@/modules/admin/service";
import { istToday, UNIT_LABEL } from "@/modules/connect/challenges";
import { ChallengeForm } from "@/components/challenge-form";
import { archiveChallengeAction, createChallengeAction } from "../actions";
import { Flash, PageTitle, Table } from "../ui";

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);

export default async function AdminChallenges({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = await getStaffOrExit();
  const [rows, sp] = await Promise.all([listPlatformChallenges(me), searchParams]);
  return (
    <>
      <PageTitle title="Challenges" subtitle="Challenges open to every member. Companies run their own from their workspace." />
      <Flash msg={sp.msg} error={sp.error} />
      <Table head={["Challenge", "Dates", "Goal", "Joined", "Total", ""]} empty={rows.length === 0 && "No platform challenges yet."}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="font-semibold">{c.title}<span className="block text-xs font-normal text-muted">{c.state}</span></td>
            <td className="whitespace-nowrap">{c.startsOn} to {c.endsOn}</td>
            <td>{fmt(c.goal)} {UNIT_LABEL[c.unit].many}</td>
            <td>{c.participants}</td>
            <td>{c.together === null ? "—" : fmt(c.together)}</td>
            <td>
              <form action={archiveChallengeAction}>
                <input type="hidden" name="challengeId" value={c.id} />
                <button className="btn-outline min-h-9 px-3 text-sm">End and hide</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      <section className="rounded-2xl bg-white p-6 ring-1 ring-line">
        <h2 className="mb-4 text-lg font-bold">New challenge for everyone</h2>
        <ChallengeForm action={createChallengeAction} today={istToday()} />
      </section>
    </>
  );
}
