import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { Card } from "@/components/ui/card";

const TITLES: Record<string, string> = {
  shipping: "Shipping policy",
  returns: "Returns & refund policy",
  terms: "Terms of use",
  privacy: "Privacy policy",
  grievance: "Grievance redressal",
  contact: "Contact us",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: TITLES[slug] ?? "Policy" };
}

export const dynamic = "force-dynamic";

/**
 * Policy pages built from store settings. These are templates — have them reviewed for your business
 * (Consumer Protection (E-Commerce) Rules, 2020 require seller details, return/refund terms and a grievance officer).
 */
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!TITLES[slug]) notFound();
  const s = await getSettings();
  const seller = s.legalName || s.storeName;
  const sections: Record<string, React.ReactNode> = {
    shipping: (
      <>
        <p>We ship across India. Orders are usually dispatched within 1–2 business days and delivered in about {s.estimatedDeliveryDays}–{s.estimatedDeliveryDays + 3} days depending on your pincode.</p>
        <p>Delivery is free on orders of {formatINR(s.freeShippingThreshold)} or more; otherwise a delivery charge of {formatINR(s.standardShippingFee)} applies{s.codFee > 0 ? `, plus a Cash on Delivery charge of ${formatINR(s.codFee)} for COD orders` : ""}. The exact amount is always shown at checkout before you pay.</p>
        <p>Once shipped, you will receive the courier name and tracking number on your order page and by email.</p>
      </>
    ),
    returns: (
      <>
        <p>You can request a return within {s.returnWindowDays} days of delivery from your order page if the item is damaged, defective, wrong, or not as described. Items must be unused with original tags and packaging.</p>
        <p>After the returned item reaches us and passes inspection, we refund the amount you paid for it. Online payments are refunded to the original payment method via Razorpay (usually 5–7 working days). Cash on Delivery orders are refunded to your bank account or UPI.</p>
        <p>You can cancel an order any time before it is shipped. Prepaid cancellations are refunded automatically.</p>
      </>
    ),
    terms: (
      <>
        <p>This website is operated by {seller}{s.storeAddress ? `, ${s.storeAddress}` : ""}. By using it you agree to these terms.</p>
        <p>Prices are in Indian Rupees and include applicable GST. We may cancel an order if an item is out of stock or a price was listed in error, in which case any payment is refunded in full.</p>
        <p>Online payments are processed securely by Razorpay. We never see or store your card details.</p>
      </>
    ),
    privacy: (
      <>
        <p>We collect the information needed to process your orders: your name, contact details, delivery addresses and order history. Payments are handled by Razorpay; we do not store card or bank details.</p>
        <p>We use your data only to fulfil orders, provide support, and — if you opt in — send offers. You can update your preferences or request deletion of your account by contacting {s.contactEmail}.</p>
        <p>Passwords are stored as one-way hashes. Access to customer data in our admin panel is restricted by role.</p>
      </>
    ),
    grievance: (
      <>
        <p>If you have a complaint about an order or our service, please contact our Grievance Officer:</p>
        <p><b>{s.grievanceOfficerName || "Grievance Officer"}</b><br />{seller}<br />{s.storeAddress || "Address to be updated"}<br />Email: {s.grievanceOfficerEmail || s.contactEmail}{s.contactPhone ? <><br />Phone: {s.contactPhone}</> : null}</p>
        <p>We acknowledge complaints within 48 hours and aim to resolve them within one month.</p>
      </>
    ),
    contact: (
      <>
        <p>Email: {s.contactEmail}</p>
        {s.contactPhone && <p>Phone: {s.contactPhone}</p>}
        {s.storeAddress && <p>Address: {s.storeAddress}</p>}
        {s.gstin && <p>GSTIN: {s.gstin}</p>}
        <p>For order issues, the fastest route is the “Need help?” button on your order page.</p>
      </>
    ),
  };
  return (
    <div className="container-page max-w-3xl py-8">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{TITLES[slug]}</h1>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">{sections[slug]}</div>
      </Card>
    </div>
  );
}
