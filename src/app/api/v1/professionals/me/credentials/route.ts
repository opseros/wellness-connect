import { put } from "@vercel/blob";
import { handle } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/modules/identity/session";
import { submitCredential } from "@/modules/professionals/service";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * multipart/form-data: file, name, issuer. The file goes to a PRIVATE
 * Vercel Blob store; only its path is saved. Reviewers open it through a
 * short-lived signed URL, never a public link.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(req.headers);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file");
  if (file.size > MAX_BYTES) throw badRequest("Files must be 10 MB or smaller");
  if (!ALLOWED.has(file.type)) throw badRequest("Upload a PDF, JPG or PNG");
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const blob = await put(`credentials/${me.id}/${crypto.randomUUID()}.${ext}`, file, { access: "private", contentType: file.type });
  return submitCredential(me.id, { name: String(form.get("name") ?? ""), issuer: String(form.get("issuer") ?? ""), blobPath: blob.pathname });
});
