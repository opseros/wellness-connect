import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listCategories } from "@/modules/professionals/service";
import { getRequirement } from "@/modules/marketplace/service";
import { PageTitle } from "@/components/ui";
import { getBuyerOrExit, orNotFound } from "../../../company";
import { RequirementForm } from "../../form";

export const metadata: Metadata = { title: "Edit requirement" };

export default async function EditRequirement({ params }: { params: Promise<{ orgId: string; requirementId: string }> }) {
  const { orgId, requirementId } = await params;
  const [{ me, org }, categories] = await Promise.all([getBuyerOrExit(orgId), listCategories()]);
  const { requirement: r } = await orNotFound(getRequirement(me.id, orgId, requirementId));
  if (r.status !== "draft" && r.status !== "published") redirect(`/company/${orgId}/requirements/${r.id}`);
  return (
    <>
      <Link href={`/company/${orgId}/requirements/${r.id}`} className="text-sm font-semibold text-brand hover:underline">← {r.title}</Link>
      <PageTitle title={r.status === "draft" ? "Continue your draft" : "Edit requirement"} subtitle={r.status === "published" ? "Professionals you've already contacted will see the updated details." : undefined} />
      <RequirementForm orgId={orgId} categories={categories} defaultCity={org.city} req={r} />
    </>
  );
}
