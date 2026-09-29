"use client";

import { useState } from "react";
import { ClipboardPaste, Link2, Loader2, Sparkles } from "lucide-react";
import { importProductDetailsAction } from "@/actions/admin/catalog";
import type { ImportedListing } from "@/lib/product-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";

/**
 * Top of the product editor: paste a product link (or the product text) and the name, SEO description,
 * brand, specifications and sizes are filled in for review. Photos and prices stay with the owner.
 */
export function ProductImportPanel({ onApply }: { onApply: (listing: ImportedListing) => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"link" | "text">("link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await importProductDetailsAction(mode === "link" ? { url } : { text, url });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.code === "IMPORT_BLOCKED") setMode("text");
      return;
    }
    onApply(res.data);
  }

  return (
    <Card className="relative overflow-hidden border-brand-200 bg-gradient-to-br from-brand-50 via-white to-saffron-50">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-bold text-brand-900"><Sparkles className="size-4 text-saffron-500" /> Auto-fill product details</p>
          <div className="flex rounded-lg bg-white p-0.5 text-xs font-semibold ring-1 ring-line" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "link"} onClick={() => { setMode("link"); setError(null); }} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 ${mode === "link" ? "bg-brand-700 text-white" : "text-slate-600"}`}><Link2 className="size-3.5" /> From a link</button>
            <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => { setMode("text"); setError(null); }} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 ${mode === "text" ? "bg-brand-700 text-white" : "text-slate-600"}`}><ClipboardPaste className="size-3.5" /> Paste details</button>
          </div>
        </div>
        {mode === "link" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="import-url">Product link</label>
            <Input id="import-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a product link — Flipkart, Amazon, brand websites…" className="h-11 bg-white text-base sm:text-sm" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (url.trim()) void run(); } }} />
            <Button type="button" className="h-11 shrink-0" onClick={run} disabled={busy || !url.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Reading page…" : "Fetch details"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="sr-only" htmlFor="import-text">Product details</label>
            <Textarea id="import-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-32 bg-white text-base sm:text-sm" placeholder={"Paste the product text here, e.g. from Meesho: open the product → Share → copy.\n\nKurti for Women\nFabric: Rayon\nPattern: Printed\nSizes: S, M, L, XL"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={run} disabled={busy || text.trim().length < 5}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Use this text</Button>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Source link (optional, kept private)" className="h-10 max-w-sm bg-white" aria-label="Source link (optional)" />
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
        <p className="text-xs text-muted">Fills the name, an SEO-friendly description, brand, specifications and sizes for you to review. Add your own photos and price, then save. Nothing is published until you save.</p>
      </CardContent>
    </Card>
  );
}
