"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Facets = { categories: { name: string; slug: string }[]; brands: string[] };

function useSetParams() {
  const router = useRouter();
  const search = useSearchParams();
  return (updates: Record<string, string | undefined>) => {
    const q = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    q.delete("page");
    router.push(`/products?${q.toString()}`);
  };
}

export function SortSelect({ current }: { current: Record<string, string | undefined> }) {
  const set = useSetParams();
  return (
    <Select aria-label="Sort by" className="h-9 w-44" value={current.sort ?? ""} onChange={(e) => set({ sort: e.target.value || undefined })}>
      <option value="">Relevance</option>
      <option value="popular">Popularity</option>
      <option value="newest">Newest first</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
      <option value="rating">Customer rating</option>
    </Select>
  );
}

function Filters({ facets, current, onApply }: { facets: Facets; current: Record<string, string | undefined>; onApply?: () => void }) {
  const set = useSetParams();
  const [min, setMin] = useState(current.min ?? "");
  const [max, setMax] = useState(current.max ?? "");
  const apply = (u: Record<string, string | undefined>) => { set(u); onApply?.(); };
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-2 font-bold">Category</h3>
        <ul className="space-y-1">
          <li><button className={cn("w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100", !current.category && "bg-brand-50 font-semibold text-brand-800")} onClick={() => apply({ category: undefined })}>All</button></li>
          {facets.categories.map((c) => (
            <li key={c.slug}>
              <button className={cn("w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100", current.category === c.slug && "bg-brand-50 font-semibold text-brand-800")} onClick={() => apply({ category: c.slug })}>
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-bold">Price (₹)</h3>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); apply({ min: min || undefined, max: max || undefined }); }}>
          <Input inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} className="h-9" aria-label="Minimum price" />
          <span className="text-muted">–</span>
          <Input inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} className="h-9" aria-label="Maximum price" />
          <Button size="sm" type="submit" variant="secondary">Go</Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[["0", "499"], ["500", "999"], ["1000", "2499"], ["2500", ""]].map(([a, b]) => (
            <button key={a} onClick={() => apply({ min: a === "0" ? undefined : a, max: b || undefined })} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brand-500">
              {b ? `₹${a}–₹${b}` : `₹${a}+`}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="mb-2 font-bold">Availability & offers</h3>
        <label className="flex items-center gap-2"><Checkbox checked={current.inStock === "1"} onChange={(e) => apply({ inStock: e.target.checked ? "1" : undefined })} /> In stock only</label>
        <label className="flex items-center gap-2"><Checkbox checked={current.onSale === "1"} onChange={(e) => apply({ onSale: e.target.checked ? "1" : undefined })} /> On discount</label>
      </section>
      <section>
        <h3 className="mb-2 font-bold">Customer rating</h3>
        <div className="flex flex-wrap gap-1.5">
          {["4", "3"].map((r) => (
            <button key={r} onClick={() => apply({ rating: current.rating === r ? undefined : r })} className={cn("rounded-full border px-3 py-1 text-xs", current.rating === r ? "border-brand-700 bg-brand-50 font-semibold" : "border-line")}>
              {r}★ & above
            </button>
          ))}
        </div>
      </section>
      {facets.brands.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">Brand</h3>
          <Select value={current.brand ?? ""} onChange={(e) => apply({ brand: e.target.value || undefined })} className="h-9">
            <option value="">All brands</option>
            {facets.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </section>
      )}
      <Button variant="outline" size="sm" className="w-full" onClick={() => apply({ category: undefined, brand: undefined, min: undefined, max: undefined, inStock: undefined, onSale: undefined, rating: undefined })}>
        Clear all filters
      </Button>
    </div>
  );
}

export function FilterPanel({ facets, current, mobileOnly }: { facets: Facets; current: Record<string, string | undefined>; mobileOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!mobileOnly) return <Filters facets={facets} current={current} />;
  const count = ["category", "brand", "min", "max", "inStock", "onSale", "rating"].filter((k) => current[k]).length;
  return (
    <div className="md:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9"><SlidersHorizontal /> Filters{count ? ` (${count})` : ""}</Button>
        </DialogTrigger>
        <DialogContent title="Filters" side="bottom">
          <Filters facets={facets} current={current} onApply={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
