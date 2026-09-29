"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The card "unfolds" from a glowing glass diamond when it mounts, and folds back into one before
 * navigating to the sibling form (Sign in ⇄ Create account). Login and register stay separate URLs,
 * and people who ask for reduced motion get an instant switch.
 */
const MorphContext = createContext<(href: string) => void>(() => {});

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MorphCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const go = useCallback((href: string) => {
    if (prefersReducedMotion()) { router.push(href); return; }
    router.prefetch(href);
    setLeaving(true);
    timer.current = window.setTimeout(() => router.push(href), 280);
  }, [router]);

  return (
    <MorphContext.Provider value={go}>
      <div className={`relative ${leaving ? "animate-morph-out" : "animate-morph-in"} origin-center will-change-transform ${className}`}>{children}</div>
      {/* The glowing diamond the card folds into */}
      <div aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-2xl glass transition-opacity duration-300 ${leaving ? "opacity-100" : "opacity-0"}`} style={{ boxShadow: "0 0 40px 6px var(--glow-color)" }} />
    </MorphContext.Provider>
  );
}

/** A link that plays the fold animation before navigating. Works as a normal link without JS. */
export function MorphLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const go = useContext(MorphContext);
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(href);
      }}
    >
      {children}
    </Link>
  );
}
