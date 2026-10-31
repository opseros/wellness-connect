import { redirect } from "next/navigation";

/** Homestays and hospitals now have their own queues. */
export default async function OldListingQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  redirect(`/admin/homestays${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}
