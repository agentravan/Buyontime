"use client";

import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lookupPincodeAction, saveAddressAction } from "@/actions/account";
import { INDIAN_STATES, isPincode } from "@/lib/pincode";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { useHydrated } from "@/components/use-hydrated";

export { INDIAN_STATES };

export type AddressView = {
  id: string; name: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; district?: string | null; state: string; pincode: string; isDefault: boolean;
};

export function formatAddress(a: Pick<AddressView, "line1" | "line2" | "landmark" | "city" | "district" | "state" | "pincode">) {
  const district = a.district && a.district !== a.city ? `, ${a.district} district` : "";
  return [a.line1, a.line2, a.landmark, `${a.city}${district}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");
}

export function AddressForm({ initial, onSaved, submitLabel = "Save address" }: { initial?: Partial<AddressView> & { id?: string }; onSaved: (id: string) => void; submitLabel?: string }) {
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  // Pincode, city, district and state are controlled so a pincode lookup can fill them in.
  const [pincode, setPincode] = useState(initial?.pincode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [areas, setAreas] = useState<string[]>([]);
  const [lookup, setLookup] = useState<"idle" | "busy" | "found" | "none">("idle");
  const latest = useRef("");

  async function onPincode(value: string) {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    setPincode(pin);
    latest.current = pin;
    if (!isPincode(pin)) { setLookup("idle"); return; }
    setLookup("busy");
    const res = await lookupPincodeAction(pin);
    if (latest.current !== pin) return; // the customer kept typing; a newer lookup is on its way
    if (!res.ok || !res.data) { setLookup("none"); return; }
    setCity(res.data.city);
    setDistrict(res.data.district);
    if (res.data.state) setState(res.data.state);
    setAreas(res.data.areas);
    setLookup("found");
  }

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
      <Field label="Area, colony (optional)" htmlFor="a-l2" error={errors.line2}><Input id="a-l2" name="line2" defaultValue={initial?.line2 ?? ""} autoComplete="address-line2" list="a-areas" /></Field>
      <Field label="Landmark (optional)" htmlFor="a-lm" error={errors.landmark}><Input id="a-lm" name="landmark" defaultValue={initial?.landmark ?? ""} /></Field>
      <Field
        label="Pincode" htmlFor="a-pin" error={errors.pincode} className="sm:col-span-2"
        hint={lookup === "none" ? "We could not find this pincode — please fill in city, district and state yourself." : "Enter your pincode and we fill in city, district and state."}
      >
        <div className="relative">
          <Input id="a-pin" name="pincode" value={pincode} onChange={(e) => void onPincode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="postal-code" required />
          {lookup === "busy" && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-label="Looking up pincode" />}
          {lookup === "found" && <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-emerald-600" aria-label="Pincode found" />}
        </div>
      </Field>
      <Field label="City / town" htmlFor="a-city" error={errors.city}><Input id="a-city" name="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required /></Field>
      <Field label="District" htmlFor="a-district" error={errors.district}><Input id="a-district" name="district" value={district} onChange={(e) => setDistrict(e.target.value)} /></Field>
      <Field label="State" htmlFor="a-state" error={errors.state} className="sm:col-span-2">
        <Select id="a-state" name="state" value={state} onChange={(e) => setState(e.target.value)} required>
          <option value="" disabled>Choose state</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      <datalist id="a-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="isDefault" defaultChecked={initial?.isDefault} /> Make this my default address</label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy || !hydrated} className="w-full sm:w-auto">{busy && <Loader2 className="animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
