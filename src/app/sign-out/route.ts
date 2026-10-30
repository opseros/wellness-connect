import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function POST() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
