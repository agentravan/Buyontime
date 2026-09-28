"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GripVertical, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type UploadedImage = { key: string; id?: string; url: string; storageKey?: string | null; alt?: string | null };

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX = 8 * 1024 * 1024;

const BLOB_MAX = 4 * 1024 * 1024;

/** Re-encodes a large photo as WebP (longest side ≤ 2400 px) so it fits the 4 MB Vercel Blob upload limit. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[2400, 0.85], [1800, 0.8], [1400, 0.75]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= BLOB_MAX) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  }
  throw new Error(`${file.name}: too large even after compression — use an image under 4 MB`);
}

/** Uploads one file to storage (Cloudinary signed direct upload, Vercel Blob, or the local dev driver). */
export async function uploadImage(file: File, folder: "products" | "categories" | "branding"): Promise<{ url: string; storageKey: string }> {
  if (!TYPES.includes(file.type)) throw new Error(`${file.name}: only JPG, PNG, WebP or AVIF`);
  if (file.size > MAX) throw new Error(`${file.name}: larger than 8 MB`);
  const signRes = await fetch("/api/admin/uploads/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
  const sign = (await signRes.json()) as { ok: boolean; error?: string; driver: "cloudinary" | "blob" | "local"; uploadUrl: string; fields: Record<string, string> };
  if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Upload is not available");
  if (sign.driver === "blob" && file.size > BLOB_MAX) file = await shrink(file);
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(sign.fields)) fd.append(k, v);
  const up = await fetch(sign.uploadUrl, { method: "POST", body: fd });
  const data = (await up.json().catch(() => ({}))) as { secure_url?: string; public_id?: string; storageKey?: string; error?: { message?: string } | string };
  if (!up.ok || !data.secure_url) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(msg ?? "Upload failed");
  }
  return { url: data.secure_url, storageKey: data.storageKey ?? `${sign.driver}:${data.public_id}` };
}

export function ImageUploader({ images, onChange, max = 12 }: { images: UploadedImage[]; onChange: (imgs: UploadedImage[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, max - images.length));
    if (list.length < files.length) toast.warning(`Only ${max} images allowed per product.`);
    setBusy(list.length);
    const added: UploadedImage[] = [];
    for (const f of list) {
      try {
        const r = await uploadImage(f, "products");
        added.push({ key: `${Date.now()}-${Math.random()}`, url: r.url, storageKey: r.storageKey });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
      setBusy((b) => b - 1);
    }
    onChange([...images, ...added]);
  };

  const replace = async (files: FileList | null) => {
    if (!files?.[0] || replaceIndex === null) return;
    setBusy(1);
    try {
      const r = await uploadImage(files[0], "products");
      onChange(images.map((img, i) => (i === replaceIndex ? { key: `${Date.now()}`, url: r.url, storageKey: r.storageKey } : img)));
      toast.success("Image replaced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(0);
      setReplaceIndex(null);
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((img, i) => (
          <div
            key={img.key}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            className={cn("group relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-50", i === 0 ? "border-brand-600" : "border-line", drag === i && "opacity-50")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.alt ?? ""} className="size-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand-700 px-1.5 text-[10px] font-bold text-white">PRIMARY</span>}
            <span className="absolute right-1 top-1 hidden cursor-grab rounded bg-white/90 p-0.5 sm:block"><GripVertical className="size-3.5" /></span>
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-slate-900/60 p-1">
              <button type="button" title="Move left" onClick={() => move(i, i - 1)} className="rounded p-1 text-white hover:bg-white/20"><ArrowLeft className="size-3.5" /></button>
              {i !== 0 && <button type="button" title="Set as primary" onClick={() => move(i, 0)} className="rounded p-1 text-white hover:bg-white/20"><Star className="size-3.5" /></button>}
              <button type="button" title="Replace" onClick={() => { setReplaceIndex(i); replaceInput.current?.click(); }} className="rounded p-1 text-white hover:bg-white/20"><RefreshCw className="size-3.5" /></button>
              <button type="button" title="Delete" onClick={() => onChange(images.filter((_, j) => j !== i))} className="rounded p-1 text-white hover:bg-red-500/70"><Trash2 className="size-3.5" /></button>
              <button type="button" title="Move right" onClick={() => move(i, i + 1)} className="rounded p-1 text-white hover:bg-white/20"><ArrowRight className="size-3.5" /></button>
            </div>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files); }}
            className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:border-brand-400 hover:text-brand-700"
          >
            {busy > 0 ? <Loader2 className="size-6 animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs font-semibold"><ImagePlus className="size-6" /> Add images</span>}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">JPG, PNG, WebP or AVIF up to 8 MB. Drag to reorder; the first image is the primary image. Images are stored in cloud storage, never in the database.</p>
      <input ref={input} type="file" accept={TYPES.join(",")} multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      <input ref={replaceInput} type="file" accept={TYPES.join(",")} hidden onChange={(e) => { void replace(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/** Single image field (category image, store logo). */
export function SingleImageField({ value, onChange, folder }: { value: string; onChange: (url: string) => void; folder: "categories" | "branding" }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 place-items-center overflow-hidden rounded-xl border border-line bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted" />}
      </div>
      <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-slate-50" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : value ? "Replace" : "Upload"}
      </button>
      {value && <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onChange("")}>Remove</button>}
      <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { onChange((await uploadImage(f, folder)).url); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); } finally { setBusy(false); }
      }} />
    </div>
  );
}
