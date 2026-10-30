import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnService, listCategories } from "@/modules/professionals/service";
import { AppError } from "@/lib/errors";
import { Flash, PageTitle } from "@/components/ui";
import { getProOrExit } from "../../me";
import { ServiceForm } from "../form";

export const metadata: Metadata = { title: "Edit service" };

export default async function EditService({ params, searchParams }: { params: Promise<{ serviceId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { me } = await getProOrExit();
  const [{ serviceId }, sp, categories] = await Promise.all([params, searchParams, listCategories()]);
  const service = await getOwnService(me.id, serviceId).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  return (
    <>
      <Link href="/pro/services" className="text-sm font-semibold text-brand hover:underline">← Services</Link>
      <PageTitle title="Edit service" subtitle={service.title} />
      <Flash error={sp.error} />
      <ServiceForm categories={categories} service={service} />
    </>
  );
}
