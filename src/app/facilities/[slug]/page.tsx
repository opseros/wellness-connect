import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";

export const metadata: Metadata = { title: "Gym, studio or wellness centre" };

export default async function FacilityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ListingDetail kind="facility" slug={slug} />;
}
