import { ListingQueuePage } from "../listings/queue";

export const metadata = { title: "Hospitals" };

export default function HospitalQueue({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; error?: string }> }) {
  return <ListingQueuePage kind="hospital" searchParams={searchParams} />;
}
