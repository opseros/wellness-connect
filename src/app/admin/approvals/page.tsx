import { redirect } from "next/navigation";
import { adminCounts } from "@/modules/admin/service";
import { getStaffOrExit } from "../staff";

/** Approvals: open the first queue that has something waiting (professionals when all are clear). */
export default async function Approvals() {
  const me = await getStaffOrExit();
  const c = await adminCounts(me);
  const first =
    [
      [c.pendingCredentials, "/admin/professionals"],
      [c.pendingHomestays, "/admin/homestays"],
      [c.pendingFacilities, "/admin/facilities"],
      [c.hospitals ? c.pendingHospitals : 0, "/admin/hospitals"],
    ].find(([n]) => Number(n) > 0)?.[1] ?? "/admin/professionals";
  redirect(String(first));
}
