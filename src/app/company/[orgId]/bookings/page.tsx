import type { Metadata } from "next";
import Link from "next/link";
import { listOrgBookings } from "@/modules/marketplace/service";
import { formatPaise } from "@/lib/money";
import { Badge, Flash, PageTitle, Table } from "@/components/ui";
import { dayTime, getBuyerOrExit } from "../company";

export const metadata: Metadata = { title: "Bookings" };
const BOOKING_LABEL: Record<string, string> = { pending: "Booked", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };

export default async function Bookings({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { orgId } = await params;
  const [{ me }, sp] = await Promise.all([getBuyerOrExit(orgId), searchParams]);
  const rows = await listOrgBookings(me.id, orgId);
  return (
    <>
      <PageTitle title="Bookings" subtitle="Sessions you've booked, newest first." />
      <Flash msg={sp.msg} error={sp.error} />
      <Table head={["Session", "Professional", "When", "Fee", "Status"]} empty={rows.length === 0 && "No bookings yet. Accept a proposal to book a session."}>
        {rows.map((b) => (
          <tr key={b.booking.id}>
            <td>
              <Link href={`/company/${orgId}/bookings/${b.booking.id}`} className="font-semibold text-brand hover:underline">{b.title}</Link>
              <br />
              <span className="text-[13px] text-muted">Up to {b.participants} participants</span>
            </td>
            <td>{b.name}</td>
            <td className="whitespace-nowrap">{dayTime(b.booking.scheduledStart)}</td>
            <td className="whitespace-nowrap">{formatPaise(b.feePaise)}</td>
            <td><Badge status={b.booking.status === "pending" ? "active" : b.booking.status} label={BOOKING_LABEL[b.booking.status]} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
