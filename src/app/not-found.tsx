import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-extrabold text-brand-700">404</p>
        <h1 className="mt-2 text-xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-1 text-sm text-muted">It may have moved, or the product is no longer available.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">Go home</Link>
          <Link href="/products" className="rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-semibold">Browse products</Link>
        </div>
      </div>
    </div>
  );
}
