import type { Metadata } from "next";
import Link from "next/link";
import { getOwnCategoryIds, listCategories } from "@/modules/professionals/service";
import { Flash, PageTitle } from "@/components/ui";
import { getProOrExit } from "../../me";
import { ServiceForm } from "../form";

export const metadata: Metadata = { title: "Add a service" };

export default async function NewService({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await getProOrExit();
  const [all, mine, sp] = await Promise.all([listCategories(), getOwnCategoryIds(profile.id), searchParams]);
  // Your own categories first.
  const categories = [...all.filter((c) => mine.includes(c.id)), ...all.filter((c) => !mine.includes(c.id))];
  return (
    <>
      <Link href="/pro/services" className="text-sm font-semibold text-brand hover:underline">← Services</Link>
      <PageTitle title="Add a service" />
      <Flash error={sp.error} />
      <ServiceForm categories={categories} />
    </>
  );
}
