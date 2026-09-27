import { formatINR } from "@/lib/money";
import type { ProfitResult } from "@/lib/profit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Shows exactly how estimated net profit was calculated, line by line. */
export function ProfitBreakdown({ profit, title = "Profit" }: { profit: ProfitResult; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {profit.isEstimate && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Estimate — order still open</span>}
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {profit.lines.map((l) => (
              <tr key={l.key} className="border-b border-line last:border-0">
                <td className="py-2 pr-2">
                  <p className="font-medium">{l.label}</p>
                  <p className="text-xs text-muted">{l.note}</p>
                </td>
                <td className={`py-2 text-right font-semibold tabular-nums ${l.amount < 0 ? "text-red-600" : "text-ink"}`}>{l.amount < 0 ? `−${formatINR(-l.amount)}` : formatINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted">Revenue</p><p className="font-bold">{formatINR(profit.revenue)}</p></div>
          <div><p className="text-xs text-muted">Costs</p><p className="font-bold">{formatINR(profit.costs)}</p></div>
          <div><p className="text-xs text-muted">Est. net profit</p><p className={`font-extrabold ${profit.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatINR(profit.profit)}</p></div>
          <div><p className="text-xs text-muted">Margin</p><p className="font-bold">{profit.marginPct}%</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
