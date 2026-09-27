import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Responsive table wrapper: scrolls horizontally on small screens. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-line bg-white", className)}>
      <table className="w-full min-w-[720px] text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:whitespace-nowrap [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr:hover]:bg-slate-50/60">
        {children}
      </table>
    </div>
  );
}

/** GET filter bar — filters live in the URL so views are shareable and server-rendered. */
export function FilterBar({ action, children }: { action: string; children: React.ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3 [&_input]:h-9 [&_select]:h-9">
      {children}
      <button type="submit" className="h-9 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">Apply</button>
      <Link href={action} className="h-9 rounded-xl border border-line px-4 text-sm font-semibold leading-9 hover:bg-slate-50">Reset</Link>
    </form>
  );
}

export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-32 flex-col gap-1 text-xs font-semibold text-muted", className)}>
      {label}
      {children}
    </label>
  );
}

export const inputCls = "rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-500 focus:outline-none";
