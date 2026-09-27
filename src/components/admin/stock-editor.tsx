"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { quickUpdateAction } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/** Quick stock / price change from the inventory table (audited server-side). */
export function StockEditor({ variantId, stock, price, mrp }: { variantId: string; stock: number; price: number; mrp: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil /> Edit</Button></DialogTrigger>
      <DialogContent title="Update stock & price">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          const res = await quickUpdateAction(variantId, {
            stock: Number(fd.get("stock")),
            price: Math.round(Number(fd.get("price")) * 100),
            mrp: Math.round(Number(fd.get("mrp")) * 100),
          });
          setBusy(false);
          if (!res.ok) { toast.error(res.error); return; }
          toast.success("Updated");
          setOpen(false);
          router.refresh();
        }}>
          <Field label="Available stock"><Input name="stock" inputMode="numeric" defaultValue={String(stock)} required /></Field>
          <Field label="Selling price (₹)"><Input name="price" inputMode="decimal" defaultValue={String(price)} required /></Field>
          <Field label="MRP (₹)"><Input name="mrp" inputMode="decimal" defaultValue={String(mrp)} required /></Field>
          <Button type="submit" className="w-full" loading={busy}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
