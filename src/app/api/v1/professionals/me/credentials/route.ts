import { handle } from "@/lib/api";
import { storeCredentialFile } from "@/lib/storage";
import { requireUser } from "@/modules/identity/session";
import { listOwnCredentials, submitCredential } from "@/modules/professionals/service";

export const GET = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  return listOwnCredentials(me.id);
});

/**
 * multipart/form-data: file, name, issuer. The file goes to private storage
 * (Vercel Blob in production); only its path is saved. Staff open it through
 * an audited, staff-only route, never a public link.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const form = await req.formData();
  const blobPath = await storeCredentialFile(me.id, form.get("file"));
  return submitCredential(me.id, { name: String(form.get("name") ?? ""), issuer: String(form.get("issuer") ?? ""), blobPath });
});
