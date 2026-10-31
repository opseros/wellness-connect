import { ListingQueuePage } from "../listings/queue";

export const metadata = { title: "Homestays" };

export default function HomestayQueue({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  return <ListingQueuePage kind="homestay" searchParams={searchParams} />;
}
