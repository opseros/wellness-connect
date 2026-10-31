import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";

export const metadata: Metadata = { title: "Hospital" };

export default async function HospitalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <ListingDetail kind="hospital" slug={(await params).slug} />;
}
