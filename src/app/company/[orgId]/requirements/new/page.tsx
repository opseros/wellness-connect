import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/modules/professionals/service";
import { PageTitle } from "@/components/ui";
import { getBuyerOrExit } from "../../company";
import { RequirementForm } from "../form";

export const metadata: Metadata = { title: "New requirement" };

export default async function NewRequirement({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [{ org }, categories] = await Promise.all([getBuyerOrExit(orgId), listCategories()]);
  return (
    <>
      <Link href={`/company/${orgId}`} className="text-sm font-semibold text-brand hover:underline">← Dashboard</Link>
      <PageTitle title="New wellness requirement" subtitle="Describe what you need. We'll show professionals who meet every must-have, ranked by fit." />
      <RequirementForm orgId={orgId} categories={categories} defaultCity={org.city} />
    </>
  );
}
