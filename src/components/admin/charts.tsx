"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; revenue: number; orders: number };

const inrShort = (v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`);

/** One measure per chart (no dual axis): revenue and order count are drawn separately. */
export function DailyBarChart({ data, metric, label }: { data: Point[]; metric: "revenue" | "orders"; label: string }) {
  const empty = data.every((d) => d[metric] === 0);
  return (
    <figure aria-label={label}>
      <div className="h-56 w-full">
        {empty ? (
          <div className="grid h-full place-items-center rounded-xl bg-slate-50 text-sm text-muted">No data for the last 30 days yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="#eef1f4" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} interval={4} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} width={52} allowDecimals={false} tickFormatter={metric === "revenue" ? inrShort : undefined} />
              <Tooltip
                cursor={{ fill: "rgb(15 23 42 / 0.04)" }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(v) => [metric === "revenue" ? `₹${Number(v ?? 0).toLocaleString("en-IN")}` : Number(v ?? 0), metric === "revenue" ? "Revenue" : "Orders"]}
                labelFormatter={(l) => `Date ${l}`}
              />
              <Bar dataKey={metric} fill="#0a7e71" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.filter((d) => d[metric] > 0).map((d) => (
              <tr key={d.day}><td className="py-0.5">{d.day}</td><td className="text-right">{metric === "revenue" ? `₹${d.revenue.toLocaleString("en-IN")}` : d.orders}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
