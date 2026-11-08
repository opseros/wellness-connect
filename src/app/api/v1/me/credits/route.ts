import { handle } from "@/lib/api";
import { requireUser } from "@/modules/identity/session";
import { myCreditHistory, myWallets } from "@/modules/marketplace/credits";

/** Your wellness credit wallets (one per employer with credits on) and your own activity. */
export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const [wallets, history] = await Promise.all([myWallets(me.id), myCreditHistory(me.id)]);
  return { wallets, history };
});
