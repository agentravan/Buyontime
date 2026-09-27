"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProductAction, setProductStatusAction } from "@/actions/admin/catalog";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";

export function ProductRowActions({ id, slug, status }: { id: string; slug: string; status: "ACTIVE" | "DRAFT" | "DISABLED" }) {
  const router = useRouter();
  const run = async (p: Promise<{ ok: boolean; error?: string; message?: string }>) => {
    const res = await p;
    if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Done"); router.refresh(); }
  };
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Product actions"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild><Link href={`/admin/products/${id}`}><Pencil /> Edit</Link></DropdownMenuItem>
          {status === "ACTIVE" && <DropdownMenuItem asChild><Link href={`/products/${slug}`} target="_blank"><ExternalLink /> View in store</Link></DropdownMenuItem>}
          {status === "ACTIVE"
            ? <DropdownMenuItem onSelect={() => void run(setProductStatusAction(id, "DISABLED"))}><EyeOff /> Disable</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => void run(setProductStatusAction(id, "ACTIVE"))}><Eye /> Enable</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        trigger={<button className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" aria-label="Delete product"><Trash2 className="size-4" /></button>}
        title="Delete this product?"
        description="It will be removed from the store, carts and wishlists. Past orders keep their details."
        destructive
        confirmLabel="Delete"
        onConfirm={() => run(deleteProductAction(id))}
      />
    </div>
  );
}
