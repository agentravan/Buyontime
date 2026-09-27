import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/order-status";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-white shadow-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-bold text-ink", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

const toneClass: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  yellow: "bg-amber-50 text-amber-800 ring-amber-600/25",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export function Badge({ tone = "gray", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function EmptyState({
  icon, title, description, action, className,
}: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center", className)}>
      {icon && <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 [&_svg]:size-7">{icon}</div>}
      <div>
        <h3 className="text-base font-bold">{title}</h3>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "gray", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: Tone; className?: string }) {
  const iconTone: Record<Tone, string> = {
    green: "bg-emerald-50 text-emerald-700", yellow: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700", gray: "bg-slate-100 text-slate-700", purple: "bg-violet-50 text-violet-700", orange: "bg-orange-50 text-orange-700",
  };
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className={cn("grid size-8 place-items-center rounded-lg [&_svg]:size-4", iconTone[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
