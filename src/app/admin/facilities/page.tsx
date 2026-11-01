import { ListingQueuePage } from "../listings/queue";

export const metadata = { title: "Gyms & studios" };

export default function FacilityQueue({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  return <ListingQueuePage kind="facility" searchParams={searchParams} />;
}
