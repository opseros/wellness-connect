import { redirect } from "next/navigation";

/**
 * Signed-in home. Connect is home (as in the Wellness Connect prototype), so
 * this sends you to the feed; notices about workspaces go to Your workspaces.
 */
export default async function AppHome({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  redirect(notice ? `/app/workspaces?notice=${encodeURIComponent(notice)}` : "/connect");
}
