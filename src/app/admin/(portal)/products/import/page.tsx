import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { BulkImport } from "@/components/admin/bulk-import";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Bulk import products" };

export default async function BulkImportPage() {
  await requireStaffPage("products:manage");
  return (
    <div>
      <Link href="/admin/products" className="text-sm font-semibold text-brand-700 hover:underline">← Products</Link>
      <PageHeader title="Bulk import products" description="Upload a products .json file. Each product's pictures are copied into your own image storage, then the product is created. Products whose SKU already exists are skipped, so the same file can be imported again safely." />
      <BulkImport />
    </div>
  );
}
