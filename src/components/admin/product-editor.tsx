"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { GstMode } from "@prisma/client";
import { saveProductAction } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { discountPercent, formatINR } from "@/lib/money";
import { calculateUnitProfit } from "@/lib/profit";
import { cn } from "@/lib/utils";
import { suggestSku, type ImportedListing } from "@/lib/product-import";
import { ImageUploader, type UploadedImage } from "./image-uploader";
import { ProductImportPanel } from "./product-import-panel";

type Variant = { id?: string; name: string; sku: string; price: string; mrp: string; stock: string; isActive: boolean };
export type ProductFormValues = {
  name: string; slug: string; sku: string; brand: string; categoryId: string; description: string;
  status: "DRAFT" | "ACTIVE" | "DISABLED"; paymentOption: "ONLINE_ONLY" | "COD_ONLY" | "ONLINE_AND_COD";
  price: string; mrp: string; costPrice: string; shippingCost: string; otherCost: string; gstRate: string;
  lowStockThreshold: string; isFeatured: boolean; sourceName: string; sourceReference: string;
  specs: { label: string; value: string }[]; variants: Variant[]; images: UploadedImage[];
};

const toPaise = (v: string) => Math.round((Number(v) || 0) * 100);

export function ProductEditor({
  id, initial, categories, profitSettings,
}: {
  id?: string;
  initial: ProductFormValues;
  categories: { id: string; name: string }[];
  profitSettings: { gstMode: GstMode; claimInputTaxCredit: boolean; gatewayFeeBps: number };
}) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setVariant = (i: number, patch: Partial<Variant>) => set("variants", v.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const economics = useMemo(() => {
    const p = { price: toPaise(v.price), costPrice: toPaise(v.costPrice), shippingCost: toPaise(v.shippingCost), otherCost: toPaise(v.otherCost), gstRate: Number(v.gstRate) || 0 };
    return { online: calculateUnitProfit(p, profitSettings, "ONLINE"), cod: calculateUnitProfit(p, profitSettings, "COD"), discount: discountPercent(toPaise(v.mrp), p.price) };
  }, [v.price, v.mrp, v.costPrice, v.shippingCost, v.otherCost, v.gstRate, profitSettings]);

  const simple = v.variants.length === 1 && v.variants[0].name === "Default";

  /** Applies an imported draft. Photos, prices and stock are never touched; Undo restores everything. */
  function applyImport(l: ImportedListing) {
    const before = v;
    const next: ProductFormValues = { ...v };
    if (l.name) next.name = l.name;
    if (l.brand && !v.brand.trim()) next.brand = l.brand;
    if (l.description) next.description = l.description;
    if (l.specs.length) {
      const kept = v.specs.filter((s) => s.label.trim() && s.value.trim());
      const labels = new Set(kept.map((s) => s.label.toLowerCase()));
      next.specs = [...kept, ...l.specs.filter((s) => !labels.has(s.label.toLowerCase()))].slice(0, 40);
    }
    if (!v.sku.trim() && l.name) next.sku = suggestSku(l.name);
    const baseSku = next.sku || "SKU";
    let sizesAdded = 0;
    if (l.sizes.length > 1 && simple) {
      next.variants = l.sizes.map((size, i) => ({
        ...(i === 0 ? { id: v.variants[0].id } : {}),
        name: size,
        sku: `${baseSku}-${size.replace(/[^A-Za-z0-9._-]/g, "").toUpperCase()}`.slice(0, 64),
        price: "", mrp: "", stock: i === 0 ? v.variants[0].stock : "0", isActive: true,
      }));
      sizesAdded = l.sizes.length;
    } else if (simple && next.sku !== v.sku) {
      next.variants = [{ ...v.variants[0], sku: next.sku }];
    }
    if (l.sourceReference && !v.sourceReference.trim()) next.sourceReference = l.sourceReference;
    if (l.sourceName && !v.sourceName.trim()) next.sourceName = l.sourceName;
    setV(next);
    const bits = ["name", "description", l.specs.length ? `${l.specs.length} specifications` : "", sizesAdded ? `${sizesAdded} sizes` : ""].filter(Boolean);
    toast.success(`Filled ${bits.join(", ")}. Review, add photos & price, then save.`, {
      duration: 8000,
      action: { label: "Undo", onClick: () => setV(before) },
    });
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...v,
      specs: v.specs.filter((s) => s.label.trim() && s.value.trim()),
      variants: v.variants.map((x) => ({ ...x, price: x.price === "" ? null : x.price, mrp: x.mrp === "" ? null : x.mrp })),
    };
    const res = await saveProductAction(payload, id, v.images.map((img) => ({ id: img.id, url: img.url, storageKey: img.storageKey, alt: img.alt })));
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    setErrors({});
    toast.success("Product saved");
    if (!id) router.replace(`/admin/products/${res.data.id}`);
    else router.refresh();
  }

  const err = (k: string) => errors[k];

  return (
    <div className="grid gap-4 pb-24 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <ProductImportPanel onApply={applyImport} />
        <Card>
          <CardHeader><CardTitle>Basic details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" error={err("name")} className="sm:col-span-2"><Input value={v.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="SKU" error={err("sku")}><Input value={v.sku} onChange={(e) => { set("sku", e.target.value); if (simple) setVariant(0, { sku: e.target.value }); }} placeholder="e.g. KUR-COT-001" /></Field>
            <Field label="Brand" error={err("brand")}><Input value={v.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
            <Field label="Category" error={err("categoryId")}>
              <Select value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="URL slug (optional)" error={err("slug")} hint="Auto-generated from the name if empty"><Input value={v.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
            <Field label="Description" error={err("description")} className="sm:col-span-2"><Textarea className="min-h-32" value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Images</CardTitle></CardHeader>
          <CardContent><ImageUploader images={v.images} onChange={(imgs) => set("images", imgs)} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pricing & costs</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="MRP (₹)" error={err("mrp")}><Input inputMode="decimal" value={v.mrp} onChange={(e) => set("mrp", e.target.value)} /></Field>
            <Field label="Selling price (₹)" error={err("price")} hint="GST inclusive"><Input inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} /></Field>
            <Field label="Discount %" hint="Edit to set price from MRP">
              <Input inputMode="numeric" value={String(economics.discount)} onChange={(e) => {
                const d = Math.min(95, Math.max(0, Number(e.target.value) || 0));
                const mrp = Number(v.mrp) || 0;
                set("price", (Math.round(mrp * (100 - d)) / 100).toFixed(2).replace(/\.00$/, ""));
              }} />
            </Field>
            <Field label="Product / source cost (₹)" error={err("costPrice")} hint="What you pay the supplier (e.g. Meesho price)"><Input inputMode="decimal" value={v.costPrice} onChange={(e) => set("costPrice", e.target.value)} /></Field>
            <Field label="Shipping cost per unit (₹)" error={err("shippingCost")} hint="Your courier cost"><Input inputMode="decimal" value={v.shippingCost} onChange={(e) => set("shippingCost", e.target.value)} /></Field>
            <Field label="Other costs per unit (₹)" error={err("otherCost")} hint="Packaging etc."><Input inputMode="decimal" value={v.otherCost} onChange={(e) => set("otherCost", e.target.value)} /></Field>
            <Field label="GST rate" error={err("gstRate")}>
              <Select value={v.gstRate} onChange={(e) => set("gstRate", e.target.value)}>
                {[0, 3, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{simple ? "Inventory" : "Variants & inventory"}</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              const base = simple ? [{ ...v.variants[0], name: "Size S" }] : v.variants;
              set("variants", [...base, { name: `Option ${base.length + 1}`, sku: `${v.sku || "SKU"}-${base.length + 1}`, price: "", mrp: "", stock: "0", isActive: true }]);
            }}><Plus /> Add variant</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.variants.map((x, i) => (
              <div key={x.id ?? i} className={cn("grid gap-2 rounded-xl border border-line p-3", simple ? "sm:grid-cols-2" : "sm:grid-cols-6")}>
                {!simple && <Field label="Option name" className="sm:col-span-2"><Input value={x.name} onChange={(e) => setVariant(i, { name: e.target.value })} placeholder="e.g. M / Blue" /></Field>}
                <Field label="Variant SKU" className={simple ? "" : "sm:col-span-2"}><Input value={x.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></Field>
                <Field label="Stock"><Input inputMode="numeric" value={x.stock} onChange={(e) => setVariant(i, { stock: e.target.value.replace(/\D/g, "") })} /></Field>
                {!simple && (
                  <>
                    <Field label="Price override (₹)"><Input inputMode="decimal" value={x.price} onChange={(e) => setVariant(i, { price: e.target.value })} placeholder="same" /></Field>
                    <Field label="MRP override (₹)"><Input inputMode="decimal" value={x.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} placeholder="same" /></Field>
                    <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={x.isActive} onChange={(e) => setVariant(i, { isActive: e.target.checked })} /> Active</label>
                    <div className="flex items-end justify-end">
                      <Button type="button" size="sm" variant="ghost" className="text-red-600" disabled={v.variants.length <= 1} onClick={() => set("variants", v.variants.filter((_, j) => j !== i))}><Trash2 /> Remove</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {err("variants") && <p className="text-xs text-red-600">{err("variants")?.[0]}</p>}
            <Field label="Low-stock warning at" hint="Admin is notified when a variant's stock falls to this level"><Input inputMode="numeric" className="max-w-32" value={v.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value.replace(/\D/g, ""))} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specifications</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => set("specs", [...v.specs, { label: "", value: "" }])}><Plus /> Add</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {v.specs.length === 0 && <p className="text-sm text-muted">e.g. Material: Cotton, Fit: Regular, Warranty: 6 months</p>}
            {v.specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Label" value={s.label} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input placeholder="Value" value={s.value} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button type="button" size="icon" variant="ghost" onClick={() => set("specs", v.specs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Status & payment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Product status">
              <Select value={v.status} onChange={(e) => set("status", e.target.value as ProductFormValues["status"])}>
                <option value="ACTIVE">Active — visible in store</option>
                <option value="DRAFT">Draft — hidden</option>
                <option value="DISABLED">Disabled — hidden</option>
              </Select>
            </Field>
            <Field label="Payment options" hint="Checkout shows only the methods allowed here (and enabled in settings).">
              <Select value={v.paymentOption} onChange={(e) => set("paymentOption", e.target.value as ProductFormValues["paymentOption"])}>
                <option value="ONLINE_ONLY">Online only</option>
                <option value="COD_ONLY">COD only</option>
                <option value="ONLINE_AND_COD">Online + COD</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} /> Feature on home page</label>
          </CardContent>
        </Card>

        <Card className="border-brand-200">
          <CardHeader><CardTitle>Estimated profit per unit</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(["online", "cod"] as const).map((m) => {
              const e = economics[m];
              return (
                <div key={m} className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase text-muted">{m === "online" ? "If paid online" : "If Cash on Delivery"}</p>
                  <div className="flex justify-between"><span>Selling price</span><span>{formatINR(toPaise(v.price))}</span></div>
                  {e.gst > 0 && <div className="flex justify-between text-red-600"><span>GST payable</span><span>−{formatINR(e.gst)}</span></div>}
                  <div className="flex justify-between text-red-600"><span>Product cost{e.itc ? " (net of ITC)" : ""}</span><span>−{formatINR(toPaise(v.costPrice) - e.itc)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Shipping + other</span><span>−{formatINR(toPaise(v.shippingCost) + toPaise(v.otherCost))}</span></div>
                  {e.gateway > 0 && <div className="flex justify-between text-red-600"><span>Razorpay fee (est.)</span><span>−{formatINR(e.gateway)}</span></div>}
                  <div className={cn("mt-1 flex justify-between border-t border-line pt-1 font-extrabold", e.profit < 0 ? "text-red-600" : "text-emerald-700")}>
                    <span>Profit</span><span>{formatINR(e.profit)} ({e.marginPct}%)</span>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">Profit = Selling price − product cost − shipping − other costs − GST/fees (per your settings). Order-level profit (incl. returns/RTO) is shown on each order.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sourcing</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Supplier / source name" hint="e.g. Meesho supplier name or wholesaler"><Input value={v.sourceName} onChange={(e) => set("sourceName", e.target.value)} /></Field>
            <Field label="Source reference / notes" hint="Supplier product link or code — for your records only, never shown to customers"><Textarea className="min-h-16" value={v.sourceReference} onChange={(e) => set("sourceReference", e.target.value)} /></Field>
            <p className="text-xs text-muted">Enter product details and images you own or are authorised to use. Nothing is fetched or copied from other websites.</p>
          </CardContent>
        </Card>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-line bg-white/95 p-3 backdrop-blur lg:left-[240px]">
        <Button variant="outline" onClick={() => router.push("/admin/products")}>Cancel</Button>
        <Button onClick={save} loading={saving}>{id ? "Save changes" : "Create product"}</Button>
      </div>
    </div>
  );
}
