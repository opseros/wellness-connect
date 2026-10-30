import { processOutbox } from "@/modules/platform/outbox";
import "@/modules/platform/handlers";

// Vercel Cron calls this every minute (vercel.json) with
// "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await processOutbox(50);
  return Response.json(result);
}
