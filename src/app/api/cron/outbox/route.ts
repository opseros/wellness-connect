import { processOutbox } from "@/modules/platform/outbox";
import { expireStaysJob } from "@/modules/stays/service";
import { purgeExpiredReports } from "@/modules/care/service";
import "@/modules/platform/handlers";

// Retry sweep for the outbox. Vercel Cron calls it on the schedule in vercel.json with
// "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Lapse unanswered stay requests and unpaid acceptances first, so their emails go out in this run.
  const stays = await expireStaysJob();
  // Care & Travel retention: reports past their delete date are destroyed.
  const reports = await purgeExpiredReports();
  const result = await processOutbox(50);
  return Response.json({ ...result, staysExpired: stays.expired, reportsDeleted: reports.deleted });
}
