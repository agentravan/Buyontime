"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAddressAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export type AddressView = {
  id: string; name: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; isDefault: boolean;
};

export function formatAddress(a: Pick<AddressView, "line1" | "line2" | "landmark" | "city" | "state" | "pincode">) {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");
}

export function AddressForm({ initial, onSaved, submitLabel = "Save address" }: { initial?: Partial<AddressView> & { id?: string }; onSaved: (id: string) => void; submitLabel?: string }) {
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        const res = await saveAddressAction({ ...Object.fromEntries(fd.entries()), isDefault: fd.get("isDefault") === "on", id: initial?.id });
        setBusy(false);
        if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
        toast.success("Address saved");
        onSaved(res.data.id);
      }}
    >
      <Field label="Full name" htmlFor="a-name" error={errors.name}><Input id="a-name" name="name" defaultValue={initial?.name} autoComplete="name" required /></Field>
      <Field label="Mobile number" htmlFor="a-phone" error={errors.phone}><Input id="a-phone" name="phone" defaultValue={initial?.phone} inputMode="tel" autoComplete="tel" required /></Field>
      <Field label="Flat, house no., building, street" htmlFor="a-l1" error={errors.line1} className="sm:col-span-2"><Input id="a-l1" name="line1" defaultValue={initial?.line1} autoComplete="address-line1" required /></Field>
      <Field label="Area, colony (optional)" htmlFor="a-l2" error={errors.line2}><Input id="a-l2" name="line2" defaultValue={initial?.line2 ?? ""} autoComplete="address-line2" /></Field>
      <Field label="Landmark (optional)" htmlFor="a-lm" error={errors.landmark}><Input id="a-lm" name="landmark" defaultValue={initial?.landmark ?? ""} /></Field>
      <Field label="Pincode" htmlFor="a-pin" error={errors.pincode}><Input id="a-pin" name="pincode" defaultValue={initial?.pincode} inputMode="numeric" maxLength={6} autoComplete="postal-code" required /></Field>
      <Field label="City" htmlFor="a-city" error={errors.city}><Input id="a-city" name="city" defaultValue={initial?.city} autoComplete="address-level2" required /></Field>
      <Field label="State" htmlFor="a-state" error={errors.state} className="sm:col-span-2">
        <Select id="a-state" name="state" defaultValue={initial?.state ?? ""} required>
          <option value="" disabled>Choose state</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="isDefault" defaultChecked={initial?.isDefault} /> Make this my default address</label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy && <Loader2 className="animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
