import type { Metadata } from "next";
import { ListingDetail } from "@/components/listing-detail";

export const metadata: Metadata = { title: "Gym, studio or wellness centre" };

export default async function FacilityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <ListingDetail kind="facility" slug={slug} sp={{ error: sp.error }} />;
}
