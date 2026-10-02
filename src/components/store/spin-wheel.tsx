"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Gift } from "lucide-react";
import { toast } from "sonner";
import { revealVoucherAction, spinAction } from "@/actions/spin";
import { Button } from "@/components/ui/button";
import type { WheelSegment } from "@/lib/spin";
import type { SpinOutcome } from "@/server/spin";
import { cn } from "@/lib/utils";

const COLORS = ["#0c655c", "#f97c07", "#0f9d8b", "#ffb94a", "#11433f", "#dd5802"];
const TEXT_ON = ["#ffffff", "#ffffff", "#ffffff", "#3b1d00", "#ffffff", "#ffffff"];
const VOUCHER_FILL = "#5b21b6";
const VOUCHER_TEXT = "#ffe7a8";
const SPIN_MS = 4600;
const BULBS = 18;

function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * The wheel: a fixed rim with lights and a pointer, the turning disc of prizes, and a hub that doubles
 * as the spin button. Slices are equal in size.
 */
function Wheel({ segments, rotation, spinning, onSpin, busy }: { segments: WheelSegment[]; rotation: number; spinning: boolean; onSpin?: () => void; busy?: boolean }) {
  const n = segments.length;
  const step = 360 / n;
  const describe = (s: WheelSegment) => (s.note ? `${s.label} (${s.note})` : s.label);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[250px]">
      {/* Fixed rim with lights */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full drop-shadow-xl" aria-hidden>
        <defs>
          <linearGradient id="spin-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f514b" />
            <stop offset="1" stopColor="#032825" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="99" fill="url(#spin-rim)" />
        <circle cx="100" cy="100" r="99" fill="none" stroke="#ffd588" strokeWidth="1.5" />
        {Array.from({ length: BULBS }).map((_, i) => {
          const b = point(100, 100, 93.5, (360 / BULBS) * i + 360 / BULBS / 2);
          return <circle key={i} cx={b.x} cy={b.y} r="2.4" fill={i % 2 ? "#ffffff" : "#ffd588"} className={i % 2 ? "motion-safe:animate-pulse" : undefined} />;
        })}
      </svg>

      {/* Turning disc */}
      <svg
        data-wheel
        viewBox="0 0 200 200"
        className="absolute inset-[11.5%] size-[77%] rounded-full motion-reduce:!duration-300"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.1, 1)` : "none" }}
        role="img"
        aria-label={`Prize wheel: ${segments.map(describe).join(", ")}`}
      >
        <defs>
          <radialGradient id="spin-gloss" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="0.75" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {n === 1 ? (
          <circle cx="100" cy="100" r="100" fill={VOUCHER_FILL} />
        ) : (
          segments.map((s, i) => {
            const a = point(100, 100, 100, i * step);
            const b = point(100, 100, 100, (i + 1) * step);
            const fill = s.prize === "GIFT_VOUCHER" ? VOUCHER_FILL : COLORS[i % COLORS.length];
            return <path key={s.prize} d={`M100 100 L${a.x} ${a.y} A100 100 0 ${step > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`} fill={fill} stroke="#ffffff" strokeWidth="2" />;
          })
        )}
        <circle cx="100" cy="100" r="100" fill="url(#spin-gloss)" pointerEvents="none" />
        {segments.map((s, i) => {
          const mid = n === 1 ? 0 : (i + 0.5) * step;
          const p = point(100, 100, n === 1 ? 58 : 64, mid);
          const voucher = s.prize === "GIFT_VOUCHER";
          return (
            <text
              key={s.prize}
              x={p.x}
              y={p.y}
              fill={voucher ? VOUCHER_TEXT : TEXT_ON[i % TEXT_ON.length]}
              fontSize={n === 1 ? 17 : n > 4 ? 12.5 : 14}
              fontWeight="800"
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              transform={`rotate(${mid} ${p.x} ${p.y})`}
            >
              {s.note ? (
                // The voucher slice carries its rule ("on 5 orders") so the wheel never implies a chance win.
                <>
                  <tspan x={p.x} dy="-0.4em">{s.label}</tspan>
                  <tspan x={p.x} dy="1.2em" fontSize="9" fontWeight="700">{s.note}</tspan>
                </>
              ) : s.label}
            </text>
          );
        })}
      </svg>

      {/* Pointer */}
      <svg viewBox="0 0 30 36" className="absolute left-1/2 top-0 z-10 h-9 w-[30px] -translate-x-1/2 -translate-y-1.5 drop-shadow" aria-hidden>
        <path d="M15 34 L3 8 A12 12 0 1 1 27 8 Z" fill="#f97c07" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="15" cy="11" r="4" fill="#ffffff" />
      </svg>

      {/* Hub: the spin button when a spin is available */}
      {onSpin ? (
        <button
          type="button"
          onClick={onSpin}
          disabled={busy}
          className="absolute left-1/2 top-1/2 z-10 grid size-[24%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-saffron-400 to-saffron-600 text-[11px] font-extrabold tracking-wide text-white shadow-lg ring-4 ring-white transition active:scale-95 disabled:opacity-80"
          aria-label="Spin the wheel"
        >
          SPIN
        </button>
      ) : (
        <span className="absolute left-1/2 top-1/2 z-10 size-[16%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-saffron-400 to-saffron-600 shadow-lg ring-4 ring-white" aria-hidden />
      )}
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-dashed border-saffron-400 bg-saffron-50 px-4 py-2 font-mono text-lg font-bold tracking-wider"
      onClick={async () => {
        try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast.error("Could not copy — please note the code down."); }
      }}
      aria-label={`Copy code ${code}`}
    >
      {code} {done ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-muted" />}
    </button>
  );
}

/** Scratch card for a gift voucher. What is underneath is only fetched once scratching starts. */
function ScratchCard({ outcome, onRevealed }: { outcome: SpinOutcome; onRevealed: (o: SpinOutcome) => void }) {
  const voucher = outcome.voucher!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cleared, setCleared] = useState(voucher.revealed);
  const asked = useRef(voucher.revealed);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || cleared) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#94a3b8");
    g.addColorStop(0.5, "#cbd5e1");
    g.addColorStop(1, "#94a3b8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#334155";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Scratch here", c.width / 2, c.height / 2);
  }, [cleared]);

  const ask = useCallback(async () => {
    if (asked.current) return;
    asked.current = true;
    const res = await revealVoucherAction(outcome.id);
    if (res.ok) onRevealed(res.data);
    else { asked.current = false; toast.error(res.error); }
  }, [outcome.id, onRevealed]);

  const scratch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
  };

  const finish = () => {
    drawing.current = false;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] === 0) clear++;
    if (clear / (data.length / 16) > 0.45) setCleared(true);
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative h-36 overflow-hidden rounded-2xl border border-line bg-saffron-50">
        <div className="absolute inset-0 grid place-items-center p-3 text-center">
          {voucher.revealed ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-saffron-600">Your gift</p>
              <p className="mt-1 text-xl font-extrabold">{voucher.brand} gift voucher</p>
              <p className="text-2xl font-extrabold text-brand-700">₹{Math.round((voucher.amount ?? 0) / 100)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Revealing…</p>
          )}
        </div>
        {!cleared && (
          <canvas
            ref={canvasRef}
            width={384}
            height={144}
            className="absolute inset-0 size-full cursor-grab touch-none"
            onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); void ask(); scratch(e); }}
            onPointerMove={(e) => { if (drawing.current) scratch(e); }}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
        )}
      </div>
      {!cleared && (
        <Button variant="link" size="sm" className="mt-2" onClick={() => { void ask(); setCleared(true); }}>Reveal without scratching</Button>
      )}
      {voucher.revealed && (
        voucher.code ? (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-muted">Your voucher code:</p>
            <CopyCode code={voucher.code} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">We will add your voucher code here and send you a notification as soon as it is ready.</p>
        )
      )}
    </div>
  );
}

function couponStatus(c: NonNullable<SpinOutcome["coupon"]>): string {
  if (c.used) return "Used on an order.";
  if (c.expired) return "This deal has expired.";
  const until = c.expiresAt ? ` before ${new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : "";
  return `Applied automatically at checkout — order${until} to use it.`;
}

/** One reward: a deal coupon or a gift-voucher scratch card. */
function Reward({ outcome, onRevealed, big }: { outcome: SpinOutcome; onRevealed: (o: SpinOutcome) => void; big?: boolean }) {
  if (outcome.voucher) {
    return (
      <div className="space-y-2">
        <p className={big ? "text-lg font-extrabold" : "text-sm font-bold"}>{outcome.voucher.revealed ? "Your gift voucher" : "Scratch to reveal your gift"}</p>
        <ScratchCard outcome={outcome} onRevealed={onRevealed} />
      </div>
    );
  }
  const c = outcome.coupon;
  const live = c && !c.used && !c.expired;
  return (
    <div className="space-y-2">
      <p className={cn(big ? "text-xl font-extrabold" : "text-sm font-bold", !live && "text-muted")}>{outcome.title}</p>
      {c && live && <CopyCode code={c.code} />}
      {c && !live && <p className="font-mono text-sm text-muted line-through">{c.code}</p>}
      {c?.description && big && <p className="text-sm text-muted">{c.description}</p>}
      {c && <p className="text-xs text-muted">{couponStatus(c)}</p>}
    </div>
  );
}

export function SpinWheel({
  segments: initialSegments, signedIn, canSpin, eligible, spinsLeft, spinsPerOrder, voucherEvery, voucherAmount, gift, results: initialResults,
}: {
  spinsLeft: number;
  spinsPerOrder: number;
  /** Delivered orders needed for the gift voucher (0 = the store is not running it). */
  voucherEvery: number;
  /** Paise. */
  voucherAmount: number;
  segments: WheelSegment[];
  signedIn: boolean;
  canSpin: boolean;
  /** False for staff accounts (admin / supplier): only customers spin. */
  eligible: boolean;
  /** The next spin is a gift-voucher spin given by the store. */
  gift: "granted" | "milestone" | null;
  /** Newest first. */
  results: SpinOutcome[];
}) {
  const router = useRouter();
  const [segments, setSegments] = useState(initialSegments);
  const [results, setResults] = useState(initialResults);
  const [fresh, setFresh] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);

  // Rotation that brings slice `i` under the pointer (a one-slice wheel keeps its label upright).
  const restAngle = (i: number, n: number) => (n === 1 ? 0 : 360 - (i + 0.5) * (360 / n));

  const replace = useCallback((o: SpinOutcome) => setResults((rs) => rs.map((r) => (r.id === o.id ? o : r))), []);

  async function spin() {
    if (busy) return;
    setBusy(true);
    const res = await spinAction();
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      router.refresh();
      return;
    }
    // Animate on the exact wheel the server used for this spin.
    setSegments(res.data.segments);
    const turns = Math.ceil(rotation / 360) * 360 + 360 * 6;
    setSpinning(true);
    setRotation(turns + restAngle(res.data.segmentIndex, res.data.segments.length));
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setSpinning(false);
      setBusy(false);
      setResults((rs) => [res.data.outcome, ...rs]);
      setFresh(res.data.outcome.id);
      router.refresh(); // deal prices in the header and across the store
    }, reduce ? 350 : SPIN_MS + 150);
  }

  const justWon = fresh ? results.find((r) => r.id === fresh) ?? null : null;
  const showSpin = canSpin && !justWon;
  const featured = justWon ?? (showSpin ? null : results[0] ?? null);
  const earlier = results.filter((r) => r.id !== featured?.id);

  return (
    <div>
      <div className="grid items-center gap-4">
        <Wheel segments={segments} rotation={rotation} spinning={spinning} busy={busy} onSpin={showSpin ? spin : undefined} />

        <div className="text-center" aria-live="polite">
          {showSpin && (
            <>
              <p className="text-xl font-extrabold tracking-tight">{gift === "milestone" ? "Your gift voucher spin is here" : gift ? "A gift spin is waiting for you" : results.length ? "You have spins waiting" : "Your free spin is ready"}</p>
              <p className="mt-0.5 text-sm text-muted">{gift ? "Spin, then scratch the card to see your gift." : "Every spin wins a deal on your next order."}</p>
              <Button size="lg" variant="accent" className="mt-3 w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-base font-extrabold shadow-lg" onClick={spin} loading={busy}>{busy ? "Spinning…" : "Spin now"}</Button>
              {spinsLeft > 1 && <p className="mt-2 text-xs font-semibold text-saffron-600">{spinsLeft} spins left</p>}
              {gift === "granted" && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">
                  This spin is a gift from the store to you as a partner, so it lands on the voucher. If you post about it, please say it is a gift from the store and mark the post as a paid partnership / #ad.
                </p>
              )}
            </>
          )}

          {!signedIn && (
            <>
              <p className="text-xl font-extrabold tracking-tight">Your first spin is free</p>
              <p className="mt-0.5 text-sm text-muted">Every spin wins a discount or free delivery.</p>
              <Button asChild size="lg" variant="accent" className="mt-3 w-full bg-gradient-to-r from-saffron-500 to-saffron-600 text-base font-extrabold shadow-lg"><Link href="/login?next=/spin">Sign in to spin</Link></Button>
              <p className="mt-2 text-xs text-muted">New here? <Link href="/register?next=/spin" className="font-semibold text-brand-700 hover:underline">Create an account</Link> — it takes a minute.</p>
            </>
          )}

          {signedIn && !eligible && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink">
              You are signed in with a store staff account, so there is no spin button here. Sign in with a customer account to spin.
            </p>
          )}

          {signedIn && featured && (
            <div className="space-y-3">
              {justWon && <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><Gift className="size-3.5" /> You won</p>}
              <Reward outcome={featured} onRevealed={replace} big />
              {featured.coupon && !featured.coupon.used && !featured.coupon.expired && <Button asChild variant="accent"><Link href="/products">Shop with your deal</Link></Button>}
              {justWon && canSpin && initialResults.some((r) => r.id === justWon.id) && (
                // The page has refreshed and the account still has a spin (e.g. several gift spins).
                <Button variant="outline" onClick={() => { setFresh(null); setSegments(initialSegments); setResults(initialResults); }}>Spin again ({spinsLeft} left)</Button>
              )}
            </div>
          )}

          {signedIn && eligible && !canSpin && (
            // Shown once the spins are used up (the page data refreshes right after the last spin).
            <div className="mt-4 rounded-xl bg-saffron-50 px-4 py-3 text-sm text-ink">
              <p className="font-bold">Place an order to get {spinsPerOrder} more spin{spinsPerOrder === 1 ? "" : "s"}.</p>
              {voucherEvery > 0 && <p className="mt-0.5">Complete {voucherEvery} delivered orders and an Amazon ₹{Math.round(voucherAmount / 100)} gift voucher is yours.</p>}
              <Button asChild size="sm" className="mt-2"><Link href="/products">Start shopping</Link></Button>
            </div>
          )}
        </div>
      </div>

      {signedIn && earlier.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h2 className="text-sm font-bold">Your earlier rewards</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {earlier.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-3"><Reward outcome={r} onRevealed={replace} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
