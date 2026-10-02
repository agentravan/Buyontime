"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Gift } from "lucide-react";
import { toast } from "sonner";
import { revealVoucherAction, spinAction } from "@/actions/spin";
import { Button } from "@/components/ui/button";
import type { WheelSegment } from "@/lib/spin";
import type { SpinOutcome } from "@/server/spin";
import { cn } from "@/lib/utils";

const COLORS = ["#0c655c", "#f97c07", "#0f9d8b", "#ffb94a", "#0f514b", "#dd5802"];
const TEXT_ON = ["#ffffff", "#ffffff", "#ffffff", "#0f172a", "#ffffff", "#ffffff"];
const SPIN_MS = 4600;

function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** The wheel itself. Slices are equal in size; the real chances are listed under the wheel. */
function Wheel({ segments, rotation, spinning }: { segments: WheelSegment[]; rotation: number; spinning: boolean }) {
  const n = segments.length;
  const step = 360 / n;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1" aria-hidden>
        <div className="size-0 border-x-[12px] border-t-[22px] border-x-transparent border-t-ink drop-shadow" />
      </div>
      <svg
        viewBox="0 0 200 200"
        className="size-full rounded-full shadow-lift motion-reduce:!duration-300"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.1, 1)` : "none" }}
        role="img"
        aria-label={`Prize wheel: ${segments.map((s) => s.label).join(", ")}`}
      >
        <circle cx="100" cy="100" r="99" fill="#0f172a" />
        {n === 1 ? (
          <circle cx="100" cy="100" r="94" fill={COLORS[1]} />
        ) : (
          segments.map((s, i) => {
            const a = point(100, 100, 94, i * step);
            const b = point(100, 100, 94, (i + 1) * step);
            return <path key={s.prize} d={`M100 100 L${a.x} ${a.y} A94 94 0 ${step > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`} fill={COLORS[i % COLORS.length]} stroke="#ffffff" strokeWidth="1.5" />;
          })
        )}
        {segments.map((s, i) => {
          const mid = n === 1 ? 0 : (i + 0.5) * step;
          const p = point(100, 100, n === 1 ? 52 : 60, mid);
          return (
            <text
              key={s.prize}
              x={p.x}
              y={p.y}
              fill={n === 1 ? "#ffffff" : TEXT_ON[i % TEXT_ON.length]}
              fontSize={n === 1 ? 15 : 11.5}
              fontWeight="800"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${mid} ${p.x} ${p.y})`}
            >
              {s.label}
            </text>
          );
        })}
        <circle cx="100" cy="100" r="13" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
      </svg>
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

/** Scratch card for the creator gift. What is underneath is only fetched once scratching starts. */
function ScratchCard({ voucher, onReveal }: { voucher: NonNullable<SpinOutcome["voucher"]>; onReveal: () => Promise<void> }) {
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

  const ask = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    void onReveal();
  }, [onReveal]);

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
              <p className="text-xs font-bold uppercase tracking-wide text-saffron-600">Creator gift</p>
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
            onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); ask(); scratch(e); }}
            onPointerMove={(e) => { if (drawing.current) scratch(e); }}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
        )}
      </div>
      {!cleared && (
        <Button variant="link" size="sm" className="mt-2" onClick={() => { ask(); setCleared(true); }}>Reveal without scratching</Button>
      )}
    </div>
  );
}

export function SpinWheel({
  segments, signedIn, creator, initialOutcome,
}: {
  segments: WheelSegment[];
  signedIn: boolean;
  creator: boolean;
  initialOutcome: SpinOutcome | null;
}) {
  // Rotation that brings slice `i` under the pointer (a one-slice wheel keeps its label upright).
  const restAngle = (i: number) => (segments.length === 1 ? 0 : 360 - (i + 0.5) * (360 / segments.length));
  const restAt = (prize: SpinOutcome["prize"]) => restAngle(Math.max(0, segments.findIndex((s) => s.prize === prize)));
  const [outcome, setOutcome] = useState<SpinOutcome | null>(initialOutcome);
  const [rotation, setRotation] = useState(initialOutcome ? restAt(initialOutcome.prize) : 0);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);

  async function spin() {
    if (busy || outcome) return;
    setBusy(true);
    const res = await spinAction();
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const target = 360 * 6 + restAngle(res.data.segmentIndex);
    setSpinning(true);
    setRotation(target);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setSpinning(false);
      setBusy(false);
      setOutcome(res.data.outcome);
      if (res.data.alreadySpun) toast.message("You have already used your spin — here is your reward.");
    }, reduce ? 350 : SPIN_MS + 150);
  }

  const reveal = useCallback(async () => {
    const res = await revealVoucherAction();
    if (res.ok) setOutcome(res.data);
    else toast.error(res.error);
  }, []);

  return (
    <div className="grid items-center gap-6 sm:grid-cols-2">
      <Wheel segments={segments} rotation={rotation} spinning={spinning} />

      <div className="text-center sm:text-left" aria-live="polite">
        {!outcome && (
          <>
            <p className="text-lg font-extrabold">{creator ? "Your creator gift is waiting" : "Spin once, win for sure"}</p>
            <p className="mt-1 text-sm text-muted">
              {creator ? "Spin the wheel, then scratch the card to see your gift." : "Win a discount or free delivery on your order."}
            </p>
            {signedIn ? (
              <Button size="lg" variant="accent" className="mt-4 w-full sm:w-auto" onClick={spin} loading={busy}>
                {busy ? "Spinning…" : "Spin the wheel"}
              </Button>
            ) : (
              <Button asChild size="lg" variant="accent" className="mt-4 w-full sm:w-auto">
                <Link href="/login?next=/spin">Sign in to spin</Link>
              </Button>
            )}
            {!signedIn && <p className="mt-2 text-xs text-muted">New here? <Link href="/register?next=/spin" className="font-semibold text-brand-700 hover:underline">Create an account</Link> — it takes a minute.</p>}
          </>
        )}

        {outcome && outcome.coupon && (
          <div className="space-y-3">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><Gift className="size-3.5" /> You won</p>
            <p className="text-xl font-extrabold">{outcome.title}</p>
            <CopyCode code={outcome.coupon.code} />
            {outcome.coupon.description && <p className="text-sm text-muted">{outcome.coupon.description}</p>}
            <p className={cn("text-xs", outcome.coupon.used ? "font-semibold text-muted" : "text-muted")}>
              {outcome.coupon.used
                ? "You have already used this coupon."
                : outcome.coupon.expiresAt
                  ? `Enter the code at checkout before ${new Date(outcome.coupon.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}.`
                  : "Enter the code at checkout."}
            </p>
            {!outcome.coupon.used && (
              <Button asChild variant="accent"><Link href="/products">Shop now</Link></Button>
            )}
          </div>
        )}

        {outcome && outcome.voucher && (
          <div className="space-y-3">
            <p className="text-lg font-extrabold">{outcome.voucher.revealed ? "Your creator gift" : "Scratch to reveal your creator gift"}</p>
            <ScratchCard voucher={outcome.voucher} onReveal={reveal} />
            {outcome.voucher.revealed && (
              outcome.voucher.code ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted">Your voucher code:</p>
                  <CopyCode code={outcome.voucher.code} />
                </div>
              ) : (
                <p className="text-sm text-muted">We will add your voucher code here and send you a notification as soon as it is ready.</p>
              )
            )}
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">
              This is a partner-creator reward and is not part of the customer wheel. If you post about it, please say it is a creator gift and mark the post as a paid partnership / #ad.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
