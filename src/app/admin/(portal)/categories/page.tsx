import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { CategoryManager } from "@/components/admin/category-manager";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesAdminPage() {
  await requireStaffPage("categories:manage");
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return (
    <div>
      <PageHeader title="Categories" />
      <CategoryManager categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", imageUrl: c.imageUrl ?? "", isActive: c.isActive, sortOrder: c.sortOrder, products: c._count.products }))} />
    </div>
  );
}
