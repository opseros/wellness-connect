import { handle } from "@/lib/api";
import { storeCredentialFile } from "@/lib/storage";
import { requireUser } from "@/modules/identity/session";
import { resubmitCredential } from "@/modules/professionals/service";

type Ctx = { params: Promise<{ credentialId: string }> };

/** multipart/form-data: file (required), name, issuer. Sends the credential back for review. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req.headers);
  const form = await req.formData();
  const blobPath = await storeCredentialFile(me.id, form.get("file"));
  const name = String(form.get("name") ?? "").trim();
  const issuer = form.get("issuer");
  return resubmitCredential(me.id, (await ctx.params).credentialId, { blobPath, name: name || undefined, issuer: issuer === null ? undefined : String(issuer) });
});
