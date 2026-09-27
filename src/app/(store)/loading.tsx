import { ProductGridSkeleton } from "@/components/store/product-card";

export default function Loading() {
  return (
    <div className="container-page py-6">
      <div className="skeleton mb-5 h-8 w-48" />
      <ProductGridSkeleton />
    </div>
  );
}
