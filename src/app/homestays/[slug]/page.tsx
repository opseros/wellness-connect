import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";
import type { StaySearch } from "@/components/stay-booking";

export const metadata: Metadata = { title: "Homestay" };

export default async function HomestayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<StaySearch> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <ListingDetail kind="homestay" slug={slug} sp={sp} />;
}
