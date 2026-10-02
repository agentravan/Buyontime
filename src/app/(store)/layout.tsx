import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { cartCount } from "@/server/cart";
import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { MobileBottomNav } from "@/components/store/mobile-nav";
import { AnnouncementBar } from "@/components/store/announcement-bar";
import { DealBar, DealProvider } from "@/components/store/deal";
import { getActiveDeal } from "@/server/spin";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [settings, count, categories, unread, active] = await Promise.all([
    getSettings(),
    cartCount(user),
    db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true, slug: true }, take: 10 }),
    user ? db.notification.count({ where: { audience: "CUSTOMER", userId: user.id, readAt: null } }) : Promise.resolve(0),
    getActiveDeal(user?.id),
  ]);
  const deal = settings.spinEnabled ? active?.deal ?? null : null;
  return (
    <DealProvider deal={deal}>
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar settings={settings} />
      <StoreHeader user={user} cartCount={count} unread={unread} categories={categories} storeName={settings.storeName} />
      <DealBar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <StoreFooter settings={settings} categories={categories} />
      <MobileBottomNav cartCount={count} />
    </div>
    </DealProvider>
  );
}
