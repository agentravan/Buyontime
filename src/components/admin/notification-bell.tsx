"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { markAdminNotificationsReadAction } from "@/actions/admin/operations";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/menu";
import { formatDate } from "@/lib/utils";

type Item = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string; event: string };

/** Polls the admin feed every 20s; new payments/orders pop up as toasts without a page refresh. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread: number; latest: Item[] };
        if (!alive) return;
        setUnread(data.unread);
        setItems(data.latest);
        if (seen.current) {
          const fresh = data.latest.filter((n) => !seen.current!.has(n.id) && !n.readAt);
          for (const n of fresh.slice(0, 3)) toast(n.title, { description: n.body, action: n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined });
          if (fresh.length > 0) router.refresh();
        }
        seen.current = new Set(data.latest.map((n) => n.id));
      } catch {
        /* offline — try again next tick */
      }
    };
    void tick();
    const id = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-lg p-2 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-saffron-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <p className="text-sm font-bold">Notifications</p>
          {unread > 0 && (
            <button className="text-xs font-semibold text-brand-700" onClick={async () => { await markAdminNotificationsReadAction(); setUnread(0); router.refresh(); }}>Mark all read</button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? <p className="p-4 text-sm text-muted">Nothing yet.</p> : items.map((n) => (
            <Link key={n.id} href={n.link ?? "/admin/notifications"} className={`block border-b border-line px-3 py-2.5 last:border-0 hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/50"}`}>
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(n.createdAt, true)}</p>
            </Link>
          ))}
        </div>
        <Link href="/admin/notifications" className="block border-t border-line px-3 py-2 text-center text-xs font-semibold text-brand-700">View all</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
