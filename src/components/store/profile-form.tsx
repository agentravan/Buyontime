"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePasswordAction } from "@/actions/auth";
import { updateProfileAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";

type Profile = { name: string; email: string; phone: string; dateOfBirth: string; gender: string; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean };

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Personal details</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              const res = await updateProfileAction({
                name: fd.get("name"), phone: fd.get("phone"), dateOfBirth: fd.get("dateOfBirth"), gender: fd.get("gender"),
                emailOptIn: fd.get("emailOptIn") === "on", smsOptIn: fd.get("smsOptIn") === "on", whatsappOptIn: fd.get("whatsappOptIn") === "on",
              });
              setBusy(false);
              if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
              setErrors({});
              toast.success("Profile updated");
              router.refresh();
            }}
          >
            <Field label="Full name" htmlFor="p-name" error={errors.name}><Input id="p-name" name="name" defaultValue={profile.name} required /></Field>
            <Field label="Email" htmlFor="p-email" hint="Contact support to change your email"><Input id="p-email" value={profile.email} disabled /></Field>
            <Field label="Mobile number" htmlFor="p-phone" error={errors.phone}><Input id="p-phone" name="phone" defaultValue={profile.phone} inputMode="tel" required /></Field>
            <Field label="Date of birth (optional)" htmlFor="p-dob"><Input id="p-dob" name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth} /></Field>
            <Field label="Gender (optional)" htmlFor="p-gender">
              <Select id="p-gender" name="gender" defaultValue={profile.gender}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not">Prefer not to say</option>
              </Select>
            </Field>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-700">Communication preferences</legend>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="emailOptIn" defaultChecked={profile.emailOptIn} /> Email updates and offers</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="smsOptIn" defaultChecked={profile.smsOptIn} /> SMS order updates</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox name="whatsappOptIn" defaultChecked={profile.whatsappOptIn} /> WhatsApp order updates</label>
              <p className="text-xs text-muted">Order confirmations and payment receipts are always sent by email.</p>
            </fieldset>
            <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save changes</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              setPwBusy(true);
              const res = await changePasswordAction({ current: String(fd.get("current")), next: String(fd.get("next")) });
              setPwBusy(false);
              if (!res.ok) { toast.error(res.error); return; }
              toast.success(res.message ?? "Password changed");
              form.reset();
            }}
          >
            <Field label="Current password" htmlFor="pw-c"><Input id="pw-c" name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" htmlFor="pw-n" hint="At least 8 characters with a letter and a number"><Input id="pw-n" name="next" type="password" autoComplete="new-password" required /></Field>
            <div className="sm:col-span-2"><Button type="submit" variant="outline" loading={pwBusy}>Update password</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
