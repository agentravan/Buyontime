"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { bulkImportProductAction } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/input";

type Row = { sku: string; name: string; cost_price?: number; selling_price?: number; payment_option?: string; raw: unknown };
type State = { status: "waiting" | "working" | "created" | "skipped" | "failed"; message?: string; productId?: string };

const inr = (n: number | undefined) => (typeof n === "number" ? `₹${n.toLocaleString("en-IN")}` : "—");

export function BulkImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [publish, setPublish] = useState(true);
  const [stock, setStock] = useState("20");
  const [running, setRunning] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setFileError(null); setRows([]); setStates({});
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!Array.isArray(data) || data.length === 0) throw new Error("The file must be a list of products.");
      if (data.length > 200) throw new Error("Import at most 200 products at a time.");
      const parsed = data.map((d, i): Row => {
        const o = (d ?? {}) as Record<string, unknown>;
        if (typeof o.sku !== "string" || typeof o.name !== "string") throw new Error(`Row ${i + 1} has no sku or name.`);
        return { sku: o.sku, name: o.name, cost_price: Number(o.cost_price) || undefined, selling_price: Number(o.selling_price) || undefined, payment_option: typeof o.payment_option === "string" ? o.payment_option : undefined, raw: d };
      });
      if (new Set(parsed.map((p) => p.sku)).size !== parsed.length) throw new Error("Two rows share the same SKU.");
      setRows(parsed);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "This file could not be read.");
    }
  }

  async function run() {
    setRunning(true);
    let created = 0, failed = 0;
    // One product per request, in order, so a slow picture download never times the whole import out.
    for (const row of rows) {
      const current = states[row.sku]?.status;
      if (current === "created" || current === "skipped") continue;
      setStates((s) => ({ ...s, [row.sku]: { status: "working" } }));
      const res = await bulkImportProductAction(row.raw, { publish, stock: Number(stock) || 0 }).catch((): { ok: false; error: string } => ({ ok: false, error: "Network error — press Import again to retry." }));
      if (res.ok) {
        if (res.data.status === "created") created++;
        setStates((s) => ({ ...s, [row.sku]: { status: res.data.status, message: res.data.message, productId: res.data.productId } }));
      } else {
        failed++;
        setStates((s) => ({ ...s, [row.sku]: { status: "failed", message: res.error } }));
      }
    }
    setRunning(false);
    if (failed) toast.error(`${created} imported, ${failed} failed — press Import again to retry the failed ones.`);
    else toast.success(`${created} product(s) imported.`);
  }

  const done = rows.length > 0 && rows.every((r) => ["created", "skipped"].includes(states[r.sku]?.status ?? ""));
  const tone = (s: State["status"]) => (s === "created" ? "green" : s === "skipped" ? "gray" : s === "failed" ? "red" : s === "working" ? "blue" : "yellow");

  return (
    <div className="space-y-4">
      <Card className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="Products file (.json)" error={fileError ?? undefined}>
          <Input type="file" accept="application/json,.json" disabled={running} onChange={(e) => void onFile(e.target.files?.[0])} />
        </Field>
        <Field label="Opening stock per size" hint="Units for every size of every product. 0 = listed as out of stock.">
          <Input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} disabled={running} />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={running} /> Publish straight away (untick to save as drafts)</label>
          <Button onClick={run} loading={running} disabled={rows.length === 0 || done}>{done ? "All done" : `Import ${rows.length || ""} product${rows.length === 1 ? "" : "s"}`}</Button>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">SKU</th><th className="px-2">Product</th><th className="px-2 text-right">Cost</th><th className="px-2 text-right">Price</th><th className="px-2">Payment</th><th className="px-4">Result</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = states[r.sku] ?? { status: "waiting" as const };
                return (
                  <tr key={r.sku} className="border-t border-line align-top">
                    <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                    <td className="px-2 py-2">{st.productId ? <Link href={`/admin/products/${st.productId}`} className="font-semibold text-brand-700 hover:underline">{r.name}</Link> : r.name}</td>
                    <td className="px-2 py-2 text-right">{inr(r.cost_price)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{inr(r.selling_price)}</td>
                    <td className="px-2 py-2 text-xs">{r.payment_option === "ONLINE_ONLY" ? "Online only" : r.payment_option === "COD_ONLY" ? "COD only" : "Online + COD"}</td>
                    <td className="px-4 py-2"><Badge tone={tone(st.status)}>{st.status}</Badge>{st.message && <p className="mt-0.5 max-w-xs text-xs text-muted">{st.message}</p>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
