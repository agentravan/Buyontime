"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SpinWheel } from "@/components/store/spin-wheel";
import type { SpinState } from "@/server/spin";

const DISMISSED = "bot_spin_popup_dismissed";

/**
 * Spin & Win as a popup on the home page. It opens by itself for a signed-in customer who has a
 * spin waiting (once per browser session if they close it), and whenever the page is opened with
 * `?spin=1` (the banner, "Spin now" links and the old /spin address all point there).
 */
export function SpinPopup({ state, requested }: { state: SpinState; requested: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(requested);

  useEffect(() => {
    if (requested) { setOpen(true); return; }
    if (!state.signedIn || !state.canSpin) return;
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem(DISMISSED) === "1"; } catch { /* storage unavailable: just show it */ }
    if (!dismissed) setOpen(true);
  }, [requested, state.signedIn, state.canSpin]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    try { window.sessionStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ }
    if (requested) router.replace(pathname, { scroll: false });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Spin & Win" description="First spin free · more spins with every order" className="max-w-md">
        <SpinWheel
          segments={state.segments}
          signedIn={state.signedIn}
          canSpin={state.canSpin}
          eligible={state.eligible}
          spinsLeft={state.spinsLeft}
          spinsPerOrder={state.spinsPerOrder}
          voucherEvery={state.terms.voucherEvery}
          voucherAmount={state.terms.voucherAmount}
          gift={state.gift}
          results={state.results}
        />
      </DialogContent>
    </Dialog>
  );
}
