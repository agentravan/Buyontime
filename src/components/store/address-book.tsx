"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAddressAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { AddressForm, formatAddress, type AddressView } from "./address-form";

export function AddressBook({ addresses }: { addresses: AddressView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressView | null | "new">(null);
  return (
    <div className="space-y-3">
      <Button onClick={() => setEditing("new")}><Plus /> Add address</Button>
      {addresses.length === 0 ? (
        <EmptyState icon={<MapPin />} title="No saved addresses" description="Add an address for faster checkout." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id} className="p-4 text-sm">
              <p className="font-bold">{a.name} {a.isDefault && <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">Default</span>}</p>
              <p className="mt-1 text-muted">{formatAddress(a)}</p>
              <p className="text-muted">Phone: {a.phone}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil /> Edit</Button>
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost" className="text-red-600"><Trash2 /> Delete</Button>}
                  title="Delete this address?"
                  destructive
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    const res = await deleteAddressAction(a.id);
                    if (!res.ok) toast.error(res.error); else { toast.success("Address deleted"); router.refresh(); }
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add address" : "Edit address"}>
          {editing !== null && (
            <AddressForm initial={editing === "new" ? undefined : editing} onSaved={() => { setEditing(null); router.refresh(); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
