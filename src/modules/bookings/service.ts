// My bookings: one read model over everything a member has booked
// (sessions, homestay stays and gym or studio plans). It only reads through the
// owning modules' services; it stores nothing itself.
import { listMySessions, SESSION_STATUS_LABEL } from "@/modules/sessions/service";
import { listMyStays } from "@/modules/stays/service";
import { myPlans } from "@/modules/listings/plans";

export type BookingKind = "session" | "stay" | "plan";
export type BookingTone = "good" | "wait" | "done" | "stopped";

export type MyBooking = {
  id: string;
  kind: BookingKind;
  title: string;
  detail: string;
  when: Date;
  whenLabel: string;
  amountPaise: number;
  status: string;
  tone: BookingTone;
  upcoming: boolean;
  href: string;
};

const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

const STAY_LABEL: Record<string, string> = {
  requested: "Waiting for the host",
  accepted: "Accepted, waiting for payment",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};
function tone(status: string): BookingTone {
  if (status === "confirmed") return "good";
  if (status === "requested" || status === "accepted") return "wait";
  if (status === "completed") return "done";
  return "stopped";
}

/** Everything you've booked, upcoming first (soonest first), then past (latest first). */
export async function listMyBookings(userId: string, now = new Date()): Promise<MyBooking[]> {
  const [sessions, stays, plans] = await Promise.all([listMySessions(userId), listMyStays(userId), myPlans(userId)]);
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const rows: MyBooking[] = [
    ...sessions.map((s) => ({
      id: s.id,
      kind: "session" as const,
      title: s.proName,
      detail: `${s.serviceTitle} · ${s.mode === "online" ? "Online" : "In person"}`,
      when: new Date(s.startsAt),
      whenLabel: fmtDateTime(new Date(s.startsAt)),
      amountPaise: s.pricePaise,
      status: SESSION_STATUS_LABEL[s.status],
      tone: tone(s.status),
      upcoming: new Date(s.startsAt) > now && ["requested", "accepted", "confirmed"].includes(s.status),
      href: `/sessions/${s.id}`,
    })),
    ...stays.map((s) => ({
      id: s.id,
      kind: "stay" as const,
      title: s.homestay?.name ?? "Homestay",
      detail: `${s.nights} night${s.nights === 1 ? "" : "s"} · ${s.rooms} room${s.rooms === 1 ? "" : "s"} · ${s.guests} guest${s.guests === 1 ? "" : "s"}`,
      when: new Date(`${s.checkIn}T12:00:00+05:30`),
      whenLabel: `${fmtDay(s.checkIn)} to ${fmtDay(s.checkOut)}`,
      amountPaise: s.totalPaise,
      status: STAY_LABEL[s.status] ?? s.status,
      tone: tone(s.status),
      upcoming: new Date(`${s.checkOut}T12:00:00+05:30`) > now && ["requested", "accepted", "confirmed"].includes(s.status),
      href: `/stays/${s.id}`,
    })),
    ...plans.map((p) => {
      const live = p.status === "active" && p.endsOn >= todayYmd;
      return {
        id: p.id,
        kind: "plan" as const,
        title: p.facility?.name ?? "Gym or studio",
        detail: `${p.planName} · ${p.paidWith === "credits" ? "company credits" : "card"}`,
        when: new Date(`${p.startsOn}T06:00:00+05:30`),
        whenLabel: `${fmtDay(p.startsOn)} to ${fmtDay(p.endsOn)}`,
        amountPaise: p.pricePaise,
        status: p.status === "cancelled" ? "Cancelled" : live ? "Active" : "Ended",
        tone: (p.status === "cancelled" ? "stopped" : live ? "good" : "done") as BookingTone,
        upcoming: live,
        href: p.facility ? `/facilities/${p.facility.slug}` : "/explore?tab=gyms",
      };
    }),
  ];
  const up = rows.filter((r) => r.upcoming).sort((a, b) => +a.when - +b.when);
  const past = rows.filter((r) => !r.upcoming).sort((a, b) => +b.when - +a.when);
  return [...up, ...past];
}
