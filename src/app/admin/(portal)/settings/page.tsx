import type { Metadata } from "next";
import { appUrl, emailConfig, razorpayConfig, storageDriver } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { TestEmailButton } from "@/components/admin/test-email-button";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaffPage("settings:manage");
  const s = await getSettings();
  const rzp = razorpayConfig();
  const email = emailConfig();
  const storage = storageDriver();
  const ok = (b: boolean, yes = "Configured", no = "Not configured") => <Badge tone={b ? "green" : "red"}>{b ? yes : no}</Badge>;

  return (
    <div>
      <PageHeader title="Settings" description="Secret keys are configured as environment variables on the server and are never displayed here." />
      <Card className="mb-4">
        <CardHeader><CardTitle>Integrations status</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="space-y-1.5 rounded-xl border border-line p-3">
            <p className="font-bold">Razorpay</p>
            <p className="flex items-center justify-between">API keys {ok(rzp.configured)}</p>
            <p className="flex items-center justify-between">Mode <Badge tone={rzp.mode === "live" ? "green" : "yellow"}>{rzp.mode}</Badge></p>
            <p className="flex items-center justify-between">Webhook secret {ok(rzp.webhookConfigured)}</p>
            <p className="flex items-center justify-between">Public key (browser) {ok(Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID))}</p>
            <p className="text-xs text-muted">Webhook URL: <span className="select-all font-mono">{appUrl()}/api/webhooks/razorpay</span></p>
            <p className="text-xs text-muted">Key ID: {rzp.keyId ? `${rzp.keyId.slice(0, 12)}••••` : "—"} (secret never shown)</p>
          </div>
          <div className="space-y-1.5 rounded-xl border border-line p-3">
            <p className="font-bold">Other services</p>
            <p className="flex items-center justify-between">Image storage <Badge tone={storage === "local" ? "yellow" : "green"}>{storage === "cloudinary" ? "Cloudinary" : storage === "blob" ? "Vercel Blob" : "Local (dev only)"}</Badge></p>
            <p className="flex items-center justify-between">Email {email.provider ? <Badge tone="green">{email.provider === "smtp" ? "SMTP mailbox" : "Resend"}</Badge> : <Badge tone="red">Not configured</Badge>}</p>
            {email.configured && <TestEmailButton />}
            <p className="flex items-center justify-between">SMS webhook {ok(Boolean(process.env.SMS_WEBHOOK_URL))}</p>
            <p className="flex items-center justify-between">WhatsApp webhook {ok(Boolean(process.env.WHATSAPP_WEBHOOK_URL))}</p>
            <p className="flex items-center justify-between">Cron secret {ok(Boolean(process.env.CRON_SECRET))}</p>
          </div>
        </CardContent>
      </Card>
      <SettingsForm
        initial={{
          storeName: s.storeName, tagline: s.tagline ?? "", logoUrl: s.logoUrl ?? "", contactEmail: s.contactEmail, contactPhone: s.contactPhone,
          storeAddress: s.storeAddress, legalName: s.legalName ?? "", gstin: s.gstin ?? "", grievanceOfficerName: s.grievanceOfficerName ?? "",
          grievanceOfficerEmail: s.grievanceOfficerEmail ?? "", onlinePaymentEnabled: s.onlinePaymentEnabled, codEnabled: s.codEnabled,
          codFee: s.codFee / 100, codMaxOrderValue: s.codMaxOrderValue !== null ? s.codMaxOrderValue / 100 : null, codMinOrderValue: s.codMinOrderValue / 100,
          codBlockedPincodes: s.codBlockedPincodes.join(", "), codMarkPaidOnDelivery: s.codMarkPaidOnDelivery, mixedCartPolicy: s.mixedCartPolicy,
          paymentWindowMinutes: s.paymentWindowMinutes, inventoryPolicy: s.inventoryPolicy, defaultLowStockThreshold: s.defaultLowStockThreshold,
          freeShippingThreshold: s.freeShippingThreshold / 100, standardShippingFee: s.standardShippingFee / 100, estimatedDeliveryDays: s.estimatedDeliveryDays,
          unserviceablePincodes: s.unserviceablePincodes.join(", "), returnWindowDays: s.returnWindowDays, gstMode: s.gstMode,
          claimInputTaxCredit: s.claimInputTaxCredit, gatewayFeeBps: s.gatewayFeeBps / 100, packagingCostPerOrder: s.packagingCostPerOrder / 100,
          codCollectionCharge: s.codCollectionCharge / 100, codRtoRatePct: s.codRtoRatePct, vipLifetimeSpend: s.vipLifetimeSpend / 100,
          spinEnabled: s.spinEnabled, spinsPerOrder: s.spinsPerOrder, spinWeight10: s.spinWeight10, spinWeight20: s.spinWeight20, spinWeight30: s.spinWeight30,
          spinWeightFreeDelivery: s.spinWeightFreeDelivery, spinMinOrder: s.spinMinOrder / 100, spinMaxDiscount: s.spinMaxDiscount / 100,
          spinCouponValidDays: s.spinCouponValidDays, giftVoucherAmount: s.giftVoucherAmount / 100,
          referralEnabled: s.referralEnabled, referralRewardMin: s.referralRewardMin / 100, referralRewardMax: s.referralRewardMax / 100,
          referralMilestoneBonus: s.referralMilestoneBonus / 100, referralCouponMinOrder: s.referralCouponMinOrder / 100, referralCouponValidDays: s.referralCouponValidDays,
          spinVoucherEveryOrders: s.spinVoucherEveryOrders,
          loginLook: s.loginLook, orderAlertEmail: s.orderAlertEmail ?? "", emailNotifications: s.emailNotifications, smsNotifications: s.smsNotifications, whatsappNotifications: s.whatsappNotifications,
        }}
      />
    </div>
  );
}
