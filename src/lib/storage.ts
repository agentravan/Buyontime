import "server-only";
import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import { del, put } from "@vercel/blob";
import path from "path";
import { isProduction, storageDriver } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Image storage, in order of preference:
 *  - Cloudinary: signed direct uploads from the browser (large files never pass through serverless functions).
 *  - Vercel Blob: uploads go through /api/admin/uploads/blob (≤ 4 MB — Vercel's request-body limit).
 *  - local: writes to /public/uploads for development; refused in production.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Vercel functions accept request bodies up to 4.5 MB, so Blob uploads (which pass through a function) are capped at 4 MB. */
export const MAX_BLOB_IMAGE_BYTES = 4 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export type UploadSignature =
  | { driver: "cloudinary"; uploadUrl: string; fields: Record<string, string> }
  | { driver: "blob"; uploadUrl: string; fields: Record<string, string> }
  | { driver: "local"; uploadUrl: string; fields: Record<string, string> };

export function signUpload(folder: string): UploadSignature {
  const driver = storageDriver();
  if (driver === "cloudinary") {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = process.env.CLOUDINARY_API_KEY!;
    const secret = process.env.CLOUDINARY_API_SECRET!;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const fullFolder = `${process.env.CLOUDINARY_FOLDER || "buyontime"}/${folder}`;
    // Cloudinary signature: sha1 of alphabetically-sorted params + api_secret.
    const toSign = `folder=${fullFolder}&timestamp=${timestamp}${secret}`;
    const signature = createHash("sha1").update(toSign).digest("hex");
    return {
      driver,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
      fields: { api_key: apiKey, timestamp, signature, folder: fullFolder },
    };
  }
  if (driver === "blob") return { driver, uploadUrl: "/api/admin/uploads/blob", fields: { folder } };
  if (isProduction && process.env.ALLOW_LOCAL_UPLOADS !== "true") {
    throw new AppError("Image storage is not configured. Connect a Vercel Blob store or set the CLOUDINARY_* environment variables.", "STORAGE_NOT_CONFIGURED", 503);
  }
  return { driver, uploadUrl: "/api/admin/uploads/local", fields: { folder } };
}

export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("/uploads/") || url.startsWith("/seed/")) return true;
  if (storageDriver() === "blob" || url.includes(BLOB_HOST_SUFFIX)) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST_SUFFIX)) return true;
    } catch {
      /* not a URL */
    }
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/`);
}

export async function saveLocalUpload(file: File, folder: string): Promise<{ url: string; storageKey: string }> {
  if (isProduction && process.env.ALLOW_LOCAL_UPLOADS !== "true") throw new AppError("Local uploads are disabled in production.", "FORBIDDEN", 403);
  checkImage(file, MAX_IMAGE_BYTES);
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "") || "misc";
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${safeFolder}/${name}`, storageKey: `local:${safeFolder}/${name}` };
}

function checkImage(file: File, maxBytes: number) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new AppError("Only JPG, PNG, WebP or AVIF images are allowed.");
  if (file.size > maxBytes) throw new AppError(`Images must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
}

export async function saveBlobUpload(file: File, folder: string): Promise<{ url: string; storageKey: string }> {
  if (storageDriver() !== "blob") throw new AppError("Vercel Blob storage is not configured.", "STORAGE_NOT_CONFIGURED", 503);
  checkImage(file, MAX_BLOB_IMAGE_BYTES);
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "") || "misc";
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const blob = await put(`${safeFolder}/${Date.now()}.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
  return { url: blob.url, storageKey: `blob:${blob.url}` };
}

/** Best-effort deletion from storage. Failures are logged, never thrown (DB state is the source of truth). */
export async function deleteStoredImage(storageKey: string | null | undefined) {
  if (!storageKey) return;
  try {
    if (storageKey.startsWith("local:")) {
      const rel = storageKey.slice("local:".length).replace(/\.\./g, "");
      await unlink(path.join(process.cwd(), "public", "uploads", rel)).catch(() => undefined);
      return;
    }
    if (storageKey.startsWith("blob:")) {
      if (process.env.BLOB_READ_WRITE_TOKEN) await del(storageKey.slice("blob:".length));
      return;
    }
    if (storageKey.startsWith("cloudinary:") && storageDriver() === "cloudinary") {
      const publicId = storageKey.slice("cloudinary:".length);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
      const body = new URLSearchParams({ public_id: publicId, timestamp, api_key: process.env.CLOUDINARY_API_KEY!, signature });
      await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: "POST", body, signal: AbortSignal.timeout(10000) });
    }
  } catch (err) {
    console.error("[storage] delete failed", storageKey, err);
  }
}
