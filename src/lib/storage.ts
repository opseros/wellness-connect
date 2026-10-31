import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { badRequest } from "@/lib/errors";

/**
 * Private file storage for credential documents.
 * - With BLOB_READ_WRITE_TOKEN set: a PRIVATE Vercel Blob store (production).
 * - Without it, outside production: files under ./.data/uploads, so local
 *   development works with no cloud account.
 * Files never get a public URL; they are streamed through staff-only routes.
 */
const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const localRoot = () => path.join(process.cwd(), ".data", "uploads");

function assertConfigured() {
  if (!blobConfigured() && process.env.VERCEL_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set: connect a private Vercel Blob store to the project");
  }
}

function localPath(p: string) {
  const full = path.resolve(localRoot(), p);
  if (!full.startsWith(localRoot() + path.sep)) throw new Error("Invalid storage path");
  return full;
}

export async function putPrivateFile(pathname: string, file: Blob, contentType: string): Promise<string> {
  assertConfigured();
  if (blobConfigured()) return (await put(pathname, file, { access: "private", contentType })).pathname;
  const full = localPath(pathname);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  await writeFile(`${full}.type`, contentType);
  return pathname;
}

export async function getPrivateFile(pathname: string): Promise<{ body: ReadableStream | Uint8Array; contentType: string } | null> {
  assertConfigured();
  if (blobConfigured()) {
    const file = await get(pathname, { access: "private" });
    if (!file || file.statusCode !== 200) return null;
    return { body: file.stream, contentType: file.blob.contentType ?? "application/octet-stream" };
  }
  try {
    const full = localPath(pathname);
    const [body, contentType] = await Promise.all([readFile(full), readFile(`${full}.type`, "utf8").catch(() => "application/octet-stream")]);
    return { body: new Uint8Array(body), contentType };
  } catch {
    return null;
  }
}

// Vercel limits a request body to 4.5 MB, so keep files under that.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Validates and stores a credential document; returns the private path. */
export async function storeCredentialFile(userId: string, file: unknown): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw badRequest("Attach a file");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files must be 4 MB or smaller");
  const ext = ALLOWED[file.type];
  if (!ext) throw badRequest("Upload a PDF, JPG or PNG");
  return putPrivateFile(`credentials/${userId}/${crypto.randomUUID()}.${ext}`, file, file.type);
}

const IMAGES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Verification document for a homestay or hospital (PDF/JPG/PNG), stored privately. */
export async function storeOrgDocument(orgId: string, file: unknown): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw badRequest("Attach a file");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files must be 4 MB or smaller");
  const ext = ALLOWED[file.type];
  if (!ext) throw badRequest("Upload a PDF, JPG or PNG");
  return putPrivateFile(`org-documents/${orgId}/${crypto.randomUUID()}.${ext}`, file, file.type);
}

/** Listing photo (JPG/PNG/WebP). Stored privately; served only for verified listings. */
export async function storeListingPhoto(orgId: string, file: unknown): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw badRequest("Attach a photo");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Photos must be 4 MB or smaller");
  const ext = IMAGES[file.type];
  if (!ext) throw badRequest("Upload a JPG, PNG or WebP photo");
  return putPrivateFile(`listing-photos/${orgId}/${crypto.randomUUID()}.${ext}`, file, file.type);
}
