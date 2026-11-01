import { notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/session";
import { hospitalsVisible } from "@/modules/platform/features";

/** Hospitals are switched off by default (Admin → Settings); until then only super admins see these pages. */
export default async function HospitalsLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!(await hospitalsVisible(me?.id))) notFound();
  return children;
}
