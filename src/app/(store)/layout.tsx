import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { cartCount } from "@/server/cart";
import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { MobileBottomNav } from "@/components/store/mobile-nav";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [settings, count, categories, unread] = await Promise.all([
    getSettings(),
    cartCount(user),
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true, slug: true }, take: 10 }),
    user ? db.notification.count({ where: { audience: "CUSTOMER", userId: user.id, readAt: null } }) : Promise.resolve(0),
  ]);
  // Optional store-wide notice (e.g. "Test store — orders are not real"). Set SITE_NOTICE on Vercel; remove it to hide.
  const notice = process.env.SITE_NOTICE?.trim();
  return (
    <div className="flex min-h-dvh flex-col">
      {notice && (
        <div role="status" className="bg-amber-400 px-4 py-1.5 text-center text-xs font-bold text-amber-950 sm:text-sm">{notice}</div>
      )}
      <StoreHeader user={user} cartCount={count} unread={unread} categories={categories} storeName={settings.storeName} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <StoreFooter settings={settings} categories={categories} />
      <MobileBottomNav cartCount={count} />
    </div>
  );
}
