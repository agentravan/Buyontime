"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSettingsAction } from "@/actions/admin/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { SingleImageField } from "./image-uploader";

type Values = Record<string, string | number | boolean | null>;

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const text = (k: string) => ({ value: v[k] === null ? "" : String(v[k]), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })) });
  const check = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(v[k])} onChange={(e) => setV((s) => ({ ...s, [k]: e.target.checked }))} /> {label}</label>
  );
  const f = (k: string, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} hint={hint} error={errors[k]}><Input {...text(k)} {...props} /></Field>
  );

  return (
    <form
      className="space-y-4 pb-20"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveSettingsAction({ ...v, codMaxOrderValue: v.codMaxOrderValue === "" || v.codMaxOrderValue === null ? null : v.codMaxOrderValue });
        setBusy(false);
        if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
        setErrors({});
        toast.success("Settings saved");
        router.refresh();
      }}
    >
      <Card>
        <CardHeader><CardTitle>Store</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {f("storeName", "Store name")}
          {f("tagline", "Tagline")}
          <Field label="Store logo"><SingleImageField value={String(v.logoUrl ?? "")} onChange={(url) => setV((s) => ({ ...s, logoUrl: url }))} folder="branding" /></Field>
          {f("legalName", "Legal / business name")}
          {f("contactEmail", "Contact email", undefined, { type: "email" })}
          {f("contactPhone", "Contact phone")}
          <Field label="Store address" className="md:col-span-2"><Textarea {...text("storeAddress")} className="min-h-16" /></Field>
          <Field label="Customer login style" hint="Preview: open /login?look=teal or /login?look=gold">
            <Select {...text("loginLook")}>
              <option value="teal">Teal glass (store colours)</option>
              <option value="gold">Black & gold</option>
            </Select>
          </Field>
          {f("gstin", "GSTIN", "15-character GST number (printed on policies and footer)")}
          {f("grievanceOfficerName", "Grievance officer name", "Required by the Consumer Protection (E-Commerce) Rules, 2020")}
          {f("grievanceOfficerEmail", "Grievance officer email")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            {check("onlinePaymentEnabled", "Online payments (Razorpay) enabled")}
            {check("codEnabled", "Cash on Delivery enabled")}
            {check("codMarkPaidOnDelivery", "Automatically mark COD as paid when an order is marked delivered")}
          </div>
          {f("codFee", "COD charge to customer (₹)", "0 for none", { inputMode: "decimal" })}
          {f("codMaxOrderValue", "Maximum COD order value (₹)", "Leave empty for no limit", { inputMode: "decimal" })}
          {f("codMinOrderValue", "Minimum COD order value (₹)", undefined, { inputMode: "decimal" })}
          <Field label="Pincodes without COD" hint="Comma-separated 6-digit pincodes"><Textarea {...text("codBlockedPincodes")} className="min-h-16" /></Field>
          <Field label="Cart with incompatible payment methods" hint="When products in a cart share no payment method">
            <Select {...text("mixedCartPolicy")}>
              <option value="SPLIT_ORDERS">Let customer place separate orders</option>
              <option value="BLOCK">Block checkout until items are removed</option>
            </Select>
          </Field>
          {f("paymentWindowMinutes", "Online payment window (minutes)", "Unpaid online orders release their stock after this", { inputMode: "numeric" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Inventory, shipping & returns</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Online order inventory policy">
            <Select {...text("inventoryPolicy")}>
              <option value="RESERVE_AT_CHECKOUT">Reserve stock at checkout (recommended — prevents overselling)</option>
              <option value="DEDUCT_ON_PAYMENT">Deduct only when payment succeeds</option>
            </Select>
          </Field>
          {f("defaultLowStockThreshold", "Default low-stock threshold", undefined, { inputMode: "numeric" })}
          {f("freeShippingThreshold", "Free shipping above (₹)", "0 = always free", { inputMode: "decimal" })}
          {f("standardShippingFee", "Standard delivery charge (₹)", undefined, { inputMode: "decimal" })}
          {f("estimatedDeliveryDays", "Estimated delivery (days)", undefined, { inputMode: "numeric" })}
          <Field label="Unserviceable pincodes" hint="Comma-separated; checkout is blocked for these"><Textarea {...text("unserviceablePincodes")} className="min-h-16" /></Field>
          {f("returnWindowDays", "Return window (days after delivery)", undefined, { inputMode: "numeric" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Profit engine</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="GST registration">
            <Select {...text("gstMode")}>
              <option value="NOT_REGISTERED">Not registered (no GST deducted from revenue)</option>
              <option value="REGISTERED">Registered (GST in price is payable)</option>
            </Select>
          </Field>
          <div className="flex items-end pb-2">{check("claimInputTaxCredit", "Claim input tax credit on product cost")}</div>
          {f("gatewayFeeBps", "Razorpay fee estimate (%)", "Used until Razorpay reports the actual fee (2.36 = 2% + GST)", { inputMode: "decimal" })}
          {f("packagingCostPerOrder", "Packaging cost per order (₹)", undefined, { inputMode: "decimal" })}
          {f("codCollectionCharge", "Courier COD collection charge (₹ per order)", undefined, { inputMode: "decimal" })}
          {f("codRtoRatePct", "Expected COD return-to-origin rate (%)", "Adds an RTO risk provision to open COD orders", { inputMode: "numeric" })}
          {f("vipLifetimeSpend", "VIP customer threshold (₹ lifetime spend)", undefined, { inputMode: "decimal" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>New-order emails to you</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {f("orderAlertEmail", "Send every new order to", "Customer name, phone, full address, products with links and totals. Several addresses: separate with commas. Leave empty to turn off.", { type: "text", inputMode: "email", placeholder: "you@example.com" })}
          <p className="text-xs text-muted">Sent when a COD order is placed, and when an online payment is confirmed. Needs email sending configured (see integrations above).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Customer notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted">In-app notifications are always on. External channels also need their provider configured (see integrations above).</p>
          {check("emailNotifications", "Email")}
          {check("smsNotifications", "SMS (customers who opted in)")}
          {check("whatsappNotifications", "WhatsApp (customers who opted in)")}
        </CardContent>
      </Card>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-end border-t border-line bg-white/95 p-3 backdrop-blur lg:left-[240px]">
        <Button type="submit" loading={busy}>Save settings</Button>
      </div>
    </form>
  );
}
