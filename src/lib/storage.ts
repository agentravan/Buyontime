import "server-only";
import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { isProduction, storageDriver } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Image storage. Production uses Cloudinary (signed direct uploads from the browser, so large files
 * never pass through serverless functions). Local development can use the "local" driver, which writes
 * to /public/uploads and is refused in production.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type UploadSignature =
  | { driver: "cloudinary"; uploadUrl: string; fields: Record<string, string> }
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
  if (isProduction && process.env.ALLOW_LOCAL_UPLOADS !== "true") {
    throw new AppError("Image storage is not configured. Set the CLOUDINARY_* environment variables.", "STORAGE_NOT_CONFIGURED", 503);
  }
  return { driver, uploadUrl: "/api/admin/uploads/local", fields: { folder } };
}

export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("/uploads/") || url.startsWith("/seed/")) return true;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return Boolean(cloud) && url.startsWith(`https://res.cloudinary.com/${cloud}/`);
}

export async function saveLocalUpload(file: File, folder: string): Promise<{ url: string; storageKey: string }> {
  if (isProduction && process.env.ALLOW_LOCAL_UPLOADS !== "true") throw new AppError("Local uploads are disabled in production.", "FORBIDDEN", 403);
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new AppError("Only JPG, PNG, WebP or AVIF images are allowed.");
  if (file.size > MAX_IMAGE_BYTES) throw new AppError("Images must be smaller than 8 MB.");
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "") || "misc";
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${safeFolder}/${name}`, storageKey: `local:${safeFolder}/${name}` };
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
