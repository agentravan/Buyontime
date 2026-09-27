import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <ShieldAlert className="mx-auto size-12 text-amber-500" />
        <h1 className="mt-3 text-xl font-bold">You don&apos;t have access to this section</h1>
        <p className="mt-1 text-sm text-muted">Ask an administrator to grant you permission.</p>
        <Link href="/admin/dashboard" className="mt-4 inline-block rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white">Back to dashboard</Link>
      </div>
    </div>
  );
}
