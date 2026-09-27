"use client";

import { useEffect } from "react";

/** Error boundary: shows a friendly message without leaking internals. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">Please try again. If the problem continues, contact support{error.digest ? ` (ref ${error.digest})` : ""}.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    </div>
  );
}
