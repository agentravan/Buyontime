"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCategoryAction, saveCategoryAction } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/input";
import { SingleImageField } from "./image-uploader";

type Cat = { id: string; name: string; slug: string; description: string; imageUrl: string; isActive: boolean; sortOrder: number; products: number };

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const open = (c: Cat | "new") => { setEditing(c); setImage(c === "new" ? "" : c.imageUrl); };
  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="space-y-3">
      <Button onClick={() => open("new")}><Plus /> Add category</Button>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-3">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.imageUrl ? <img src={c.imageUrl} alt="" className="size-10 object-contain" /> : <span className="text-lg font-bold text-brand-700">{c.name[0]}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="text-xs text-muted">/{c.slug} · {c.products} products</p>
              <Badge tone={c.isActive ? "green" : "gray"}>{c.isActive ? "Enabled" : "Disabled"}</Badge>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => open(c)} aria-label="Edit"><Pencil /></Button>
            <ConfirmDialog
              trigger={<Button size="icon-sm" variant="ghost" className="text-red-600" aria-label="Delete"><Trash2 /></Button>}
              title={`Delete ${c.name}?`}
              description="Categories with products cannot be deleted — disable them instead."
              destructive
              onConfirm={async () => { const r = await deleteCategoryAction(c.id); if (!r.ok) toast.error(r.error); else { toast.success("Deleted"); router.refresh(); } }}
            />
          </Card>
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={current ? "Edit category" : "New category"}>
          {editing !== null && (
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              const res = await saveCategoryAction({
                name: fd.get("name"), slug: fd.get("slug"), description: fd.get("description"), imageUrl: image,
                isActive: fd.get("isActive") === "on", sortOrder: fd.get("sortOrder"),
              }, current?.id);
              setBusy(false);
              if (!res.ok) { toast.error(res.error); return; }
              toast.success("Category saved");
              setEditing(null);
              router.refresh();
            }}>
              <Field label="Name"><Input name="name" defaultValue={current?.name} required /></Field>
              <Field label="URL name (optional)"><Input name="slug" defaultValue={current?.slug} /></Field>
              <Field label="Description"><Textarea name="description" defaultValue={current?.description} className="min-h-16" /></Field>
              <Field label="Image"><SingleImageField value={image} onChange={setImage} folder="categories" /></Field>
              <Field label="Sort order"><Input name="sortOrder" inputMode="numeric" defaultValue={String(current?.sortOrder ?? 0)} /></Field>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="isActive" defaultChecked={current ? current.isActive : true} /> Enabled (visible in store)</label>
              <Button type="submit" className="w-full" loading={busy}>Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
