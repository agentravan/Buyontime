"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, CreditCard, Lock, MapPin, Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { placeOrderAction, quoteCheckoutAction, type Quote } from "@/actions/checkout";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AddressForm, formatAddress, type AddressView } from "./address-form";
import { payWithRazorpay } from "./razorpay";

type Line = { id: string; name: string; variantName: string | null; imageUrl: string | null; quantity: number; unitPrice: number; unitMrp: number };
type Method = "ONLINE" | "COD";

function Step({ n, title, done, children, action }: { n: number; title: string; done?: boolean; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2.5 font-bold">
          <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", done ? "bg-emerald-600 text-white" : "bg-brand-700 text-white")}>
            {done ? <Check className="size-3.5" /> : n}
          </span>
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export function CheckoutForm({
  user, addresses: initialAddresses, lines, group, initialQuote, razorpayMode, estimatedDeliveryDays,
}: {
  user: { name: string; email: string; phone: string };
  addresses: AddressView[];
  lines: Line[];
  group: Method | null;
  initialQuote: Quote;
  razorpayMode: string;
  estimatedDeliveryDays: number;
}) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState<string | null>(initialAddresses[0]?.id ?? null);
  const [showAddressForm, setShowAddressForm] = useState(initialAddresses.length === 0);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [placing, setPlacing] = useState(false);
  const [quoting, startQuote] = useTransition();
  const [checkoutKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`));
  const first = useRef(true);

  const allowed: Method[] = quote.availability.methods;

  // Keep the chosen method valid as rules change (address/pincode/coupon may change COD eligibility).
  useEffect(() => {
    if (method && !allowed.includes(method)) setMethod(null);
    if (!method && allowed.length === 1) setMethod(allowed[0]);
  }, [allowed, method]);

  useEffect(() => {
    if (first.current) { first.current = false; if (!addressId) return; }
    startQuote(async () => {
      const res = await quoteCheckoutAction({ group, addressId, couponCode, paymentMethod: method });
      if (res.ok) {
        setQuote(res.data);
        if (couponCode && res.data.couponError) { toast.error(res.data.couponError); setCouponCode(null); }
      } else toast.error(res.error);
    });
  }, [addressId, couponCode, method, group]);

  const selected = addresses.find((a) => a.id === addressId) ?? null;
  const t = quote.totals;
  const mrpTotal = lines.reduce((s, l) => s + l.unitMrp * l.quantity, 0);
  const canPlace = Boolean(selected && method && allowed.includes(method) && quote.problems.length === 0 && !quoting && !placing);

  async function placeOrder() {
    if (!selected || !method) return;
    setPlacing(true);
    const res = await placeOrderAction({ addressId: selected.id, paymentMethod: method, couponCode, group, checkoutKey, note });
    if (!res.ok) {
      setPlacing(false);
      toast.error(res.error);
      router.refresh();
      return;
    }
    const { orderNumber, razorpay } = res.data;
    if (res.data.paymentMethod === "COD" || !razorpay) {
      router.push(`/checkout/success/${orderNumber}`);
      return;
    }
    await payWithRazorpay(razorpay, {
      onVerified: (on) => router.push(`/checkout/success/${on}`),
      onFailed: (msg) => { toast.error(msg); router.push(`/account/orders/${orderNumber}?payment=failed`); },
      onDismiss: () => { toast.message("Payment not completed. You can retry from your order page."); router.push(`/account/orders/${orderNumber}`); },
    });
  }

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Step n={1} title="Contact information" done>
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="text-sm text-muted">{user.email}{user.phone ? ` · ${user.phone}` : ""}</p>
        </Step>

        <Step
          n={2}
          title="Delivery address"
          done={Boolean(selected)}
          action={addresses.length > 0 && <Button size="sm" variant="ghost" onClick={() => setShowAddressForm(true)}><Plus /> Add new</Button>}
        >
          {addresses.length === 0 ? (
            <AddressForm submitLabel="Save and deliver here" onSaved={(id) => { router.refresh(); setAddresses((a) => a); setAddressId(id); window.location.reload(); }} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <label key={a.id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition", a.id === addressId ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-line hover:border-brand-300")}>
                  <input type="radio" name="address" className="mt-1 accent-brand-700" checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold"><MapPin className="size-3.5 text-brand-700" /> {a.name} {a.isDefault && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold uppercase text-slate-600">Default</span>}</span>
                    <span className="mt-1 block text-muted">{formatAddress(a)}</span>
                    <span className="mt-1 block text-muted">Phone: {a.phone}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <Dialog open={showAddressForm && addresses.length > 0} onOpenChange={setShowAddressForm}>
            <DialogContent title="Add a new address">
              <AddressForm submitLabel="Save and deliver here" onSaved={() => { setShowAddressForm(false); window.location.reload(); }} />
            </DialogContent>
          </Dialog>
        </Step>

        <Step n={3} title="Order summary" done>
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={l.imageUrl} alt={l.name} sizes="64px" /></div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-2 font-medium">{l.name}</p>
                  {l.variantName && <p className="text-xs text-muted">{l.variantName}</p>}
                  <p className="text-xs text-muted">Qty {l.quantity}</p>
                </div>
                <p className="text-sm font-bold">{formatINR(l.unitPrice * l.quantity)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Estimated delivery in {estimatedDeliveryDays}–{estimatedDeliveryDays + 2} days after dispatch.</p>
          <Textarea className="mt-3 min-h-16" placeholder="Delivery instructions (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Step>

        <Step n={4} title="Payment method" done={Boolean(method)}>
          {quote.availability.message && allowed.length === 0 && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{quote.availability.message}</p>
          )}
          <div className="grid gap-3">
            {allowed.includes("ONLINE") && (
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition", method === "ONLINE" ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-line hover:border-brand-300")}>
                <input type="radio" name="method" className="mt-1 accent-brand-700" checked={method === "ONLINE"} onChange={() => setMethod("ONLINE")} />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-bold"><CreditCard className="size-4 text-sky-700" /> 💳 Pay Online</span>
                  <span className="mt-0.5 block text-sm text-muted">UPI, cards, netbanking & wallets via Razorpay. Instant confirmation.</span>
                  {razorpayMode === "test" && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">TEST MODE</span>}
                </span>
              </label>
            )}
            {allowed.includes("COD") && (
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition", method === "COD" ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-line hover:border-brand-300")}>
                <input type="radio" name="method" className="mt-1 accent-brand-700" checked={method === "COD"} onChange={() => setMethod("COD")} />
                <span className="flex-1">
                  <span className="flex items-center gap-2 font-bold"><Banknote className="size-4 text-orange-700" /> 💵 Cash on Delivery</span>
                  <span className="mt-0.5 block text-sm text-muted">Pay in cash or UPI when your order arrives.</span>
                </span>
              </label>
            )}
            {!quote.availability.online.allowed && quote.availability.online.reason && allowed.length > 0 && (
              <p className="text-xs text-muted">Online payment unavailable: {quote.availability.online.reason}</p>
            )}
            {!quote.availability.cod.allowed && quote.availability.cod.reason && allowed.length > 0 && (
              <p className="text-xs text-muted">Cash on Delivery unavailable: {quote.availability.cod.reason}</p>
            )}
          </div>
        </Step>
      </div>

      <div className="lg:sticky lg:top-32 lg:self-start">
        <Card className="p-4 sm:p-5">
          <h2 className="font-bold">Price details</h2>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (couponInput.trim()) setCouponCode(couponInput.trim().toUpperCase()); }}
          >
            <div className="relative flex-1">
              <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input className="pl-9 uppercase" placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} aria-label="Coupon code" />
            </div>
            <Button type="submit" variant="secondary" disabled={!couponInput.trim() || quoting}>Apply</Button>
          </form>
          {quote.coupon && (
            <p className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              {quote.coupon.code} applied — you save {formatINR(quote.coupon.discount)}
              <button onClick={() => { setCouponCode(null); setCouponInput(""); }} aria-label="Remove coupon"><X className="size-3.5" /></button>
            </p>
          )}
          <dl className={cn("mt-4 space-y-2 text-sm", quoting && "opacity-60")}>
            <div className="flex justify-between"><dt>Items total (MRP)</dt><dd>{formatINR(mrpTotal)}</dd></div>
            {mrpTotal > t.subtotal && <div className="flex justify-between text-emerald-700"><dt>Discount on MRP</dt><dd>−{formatINR(mrpTotal - t.subtotal)}</dd></div>}
            {t.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Coupon discount</dt><dd>−{formatINR(t.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{t.shippingFee === 0 ? <span className="font-semibold text-emerald-700">FREE</span> : formatINR(t.shippingFee)}</dd></div>
            {t.codFee > 0 && <div className="flex justify-between"><dt>COD charge</dt><dd>{formatINR(t.codFee)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>Amount payable</dt><dd>{formatINR(t.total)}</dd></div>
            <p className="text-xs text-muted">Includes GST of {formatINR(t.gstAmount)}</p>
          </dl>
          {quote.problems.map((p) => <p key={p} className="mt-3 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{p}</p>)}
          <Button size="lg" variant="accent" className="mt-4 hidden w-full lg:flex" disabled={!canPlace} loading={placing} onClick={placeOrder}>
            {method === "ONLINE" ? <><Lock /> Pay {formatINR(t.total)}</> : method === "COD" ? "Place order" : "Choose a payment method"}
          </Button>
          <p className="mt-2 hidden text-center text-xs text-muted lg:block">By placing the order you agree to our terms and return policy.</p>
        </Card>
      </div>

      {/* Sticky mobile checkout bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-white p-3 lg:hidden">
        <div className="flex-1">
          <p className="text-xs text-muted">Payable</p>
          <p className="text-lg font-extrabold">{formatINR(t.total)}</p>
        </div>
        <Button size="lg" variant="accent" className="flex-1" disabled={!canPlace} loading={placing} onClick={placeOrder}>
          {method === "ONLINE" ? "Pay now" : method === "COD" ? "Place order" : "Select payment"}
        </Button>
      </div>
    </div>
  );
}
