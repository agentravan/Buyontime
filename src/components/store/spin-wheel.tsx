"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Gift, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { revealVoucherAction, spinAction } from "@/actions/spin";
import { Button } from "@/components/ui/button";
import type { WheelSegment } from "@/lib/spin";
import type { SpinOutcome } from "@/server/spin";
import { cn } from "@/lib/utils";

const SPIN_MS = 5200;
const STUDS = 24;
const MUTE_KEY = "bot_spin_muted";

function point(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** One painted wedge. Deals are painted twice around the wheel, the voucher once. */
type Wedge = { segmentIndex: number; prize: WheelSegment["prize"]; big: string; small: string; tone: "red" | "cream" | "gold" };

function wedgeText(s: WheelSegment, voucherAmount: number): [string, string] {
  switch (s.prize) {
    case "DISCOUNT_10": return ["10%", "OFF"];
    case "DISCOUNT_20": return ["20%", "OFF"];
    case "DISCOUNT_30": return ["30%", "OFF"];
    case "FREE_DELIVERY": return ["FREE", "DELIVERY"];
    case "GIFT_VOUCHER": return [`₹${Math.round(voucherAmount / 100)}`, "VOUCHER"];
  }
}

/**
 * Lays the prizes out as wedges: every deal twice (alternating red and cream), the voucher once in gold.
 * Purely visual — which prize is won is decided on the server.
 */
function buildWedges(segments: WheelSegment[], voucherAmount: number): Wedge[] {
  const deals = segments.map((s, i) => ({ s, i })).filter((x) => x.s.prize !== "GIFT_VOUCHER");
  const voucher = segments.map((s, i) => ({ s, i })).find((x) => x.s.prize === "GIFT_VOUCHER");
  const make = (x: { s: WheelSegment; i: number }, tone: Wedge["tone"]): Wedge => {
    const [big, small] = wedgeText(x.s, voucherAmount);
    return { segmentIndex: x.i, prize: x.s.prize, big, small, tone };
  };
  const out: Wedge[] = [];
  let k = 0;
  for (const d of deals) out.push(make(d, k++ % 2 ? "cream" : "red"));
  if (voucher) out.push(make(voucher, "gold"));
  for (const d of deals) out.push(make(d, k++ % 2 ? "cream" : "red"));
  // With an odd number of deals and no voucher the last and first wedge would match: drop the repeat.
  if (!voucher && out.length > 1 && out[0].tone === out[out.length - 1].tone) return out.slice(0, deals.length);
  return out;
}

const TONE: Record<Wedge["tone"], { fill: string; big: string; small: string }> = {
  red: { fill: "url(#spin-red)", big: "#ffe08a", small: "#ffd97a" },
  cream: { fill: "url(#spin-cream)", big: "#8f1010", small: "#7a0c0c" },
  gold: { fill: "url(#spin-gold)", big: "#3b1d00", small: "#3b1d00" },
};

/**
 * The wheel: a fixed navy-and-gold rim on a stand with a pointer, the turning disc of prizes,
 * and a gold hub that doubles as the spin button.
 */
function Wheel({
  wedges, rotation, spinning, onSpin, busy, discRef, label,
}: {
  wedges: Wedge[]; rotation: number; spinning: boolean; onSpin?: () => void; busy?: boolean;
  discRef: React.RefObject<SVGSVGElement | null>; label: string;
}) {
  const n = wedges.length;
  const step = 360 / n;
  return (
    <div className="relative mx-auto w-full max-w-[250px]">
      <div className="relative aspect-square w-full">
        {/* Fixed rim: gold edge, navy band, gold studs */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full drop-shadow-xl" aria-hidden>
          <defs>
            <linearGradient id="spin-rim-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe9a6" />
              <stop offset="0.5" stopColor="#d9a21b" />
              <stop offset="1" stopColor="#fff1c4" />
            </linearGradient>
            <linearGradient id="spin-rim-navy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#24507a" />
              <stop offset="1" stopColor="#0b2038" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="99.5" fill="url(#spin-rim-gold)" />
          <circle cx="100" cy="100" r="96" fill="url(#spin-rim-navy)" />
          <circle cx="100" cy="100" r="85.5" fill="url(#spin-rim-gold)" />
          {Array.from({ length: STUDS }).map((_, i) => {
            const b = point(100, 100, 90.8, (360 / STUDS) * i + 360 / STUDS / 2);
            return <circle key={i} cx={b.x} cy={b.y} r="1.7" fill="#ffd97a" className={i % 2 ? "motion-safe:animate-pulse" : undefined} />;
          })}
        </svg>

        {/* Turning disc */}
        <svg
          ref={discRef}
          data-wheel
          viewBox="0 0 200 200"
          className="absolute inset-[8.25%] size-[83.5%] rounded-full motion-reduce:!duration-300"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.1, 0.7, 0.1, 1)` : "none" }}
          role="img"
          aria-label={label}
        >
          <defs>
            <radialGradient id="spin-red" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse">
              <stop offset="0.15" stopColor="#e23a2e" />
              <stop offset="1" stopColor="#a30f14" />
            </radialGradient>
            <radialGradient id="spin-cream" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse">
              <stop offset="0.15" stopColor="#fffaf0" />
              <stop offset="1" stopColor="#f1dcae" />
            </radialGradient>
            <radialGradient id="spin-gold" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse">
              <stop offset="0.15" stopColor="#fff3c4" />
              <stop offset="0.7" stopColor="#f2c14e" />
              <stop offset="1" stopColor="#c98a12" />
            </radialGradient>
          </defs>
          {n === 1 ? (
            <circle cx="100" cy="100" r="100" fill={TONE[wedges[0].tone].fill} />
          ) : (
            wedges.map((w, i) => {
              const a = point(100, 100, 100, i * step);
              const b = point(100, 100, 100, (i + 1) * step);
              return <path key={i} data-wedge={i} d={`M100 100 L${a.x} ${a.y} A100 100 0 ${step > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`} fill={TONE[w.tone].fill} stroke="#d9a21b" strokeWidth="0.8" />;
            })
          )}
          {wedges.map((w, i) => {
            const mid = n === 1 ? 0 : (i + 0.5) * step;
            const p = point(100, 100, n === 1 ? 56 : 69, mid);
            const tone = TONE[w.tone];
            const tight = n > 9;
            return (
              <text key={i} x={p.x} y={p.y} textAnchor="middle" pointerEvents="none" transform={`rotate(${mid} ${p.x} ${p.y})`} style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                <tspan x={p.x} dy="-0.1em" fontSize={n === 1 ? 26 : tight ? 13 : 16} fontWeight="700" fill={tone.big}>{w.big}</tspan>
                <tspan x={p.x} dy="1.25em" fontSize={n === 1 ? 11 : tight ? 6 : 7.2} fontWeight="700" letterSpacing="0.6" fill={tone.small}>{w.small}</tspan>
              </text>
            );
          })}
          <circle cx="100" cy="100" r="99" fill="none" stroke="#7a0c0c" strokeOpacity="0.25" strokeWidth="2" />
        </svg>

        {/* Pointer */}
        <svg viewBox="0 0 30 34" className="absolute left-1/2 top-0 z-10 h-8 w-7 -translate-x-1/2 translate-y-[6%] drop-shadow" aria-hidden>
          <path d="M15 32 L4 6 Q15 0 26 6 Z" fill="url(#spin-rim-gold)" stroke="#8a6410" strokeWidth="1" strokeLinejoin="round" />
        </svg>

        {/* Hub: the spin button when a spin is available */}
        {onSpin ? (
          <button
            type="button"
            onClick={onSpin}
            disabled={busy}
            className="absolute left-1/2 top-1/2 z-10 grid size-[23%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-extrabold tracking-widest text-[#3b1d00] shadow-lg ring-2 ring-[#8a6410]/60 transition active:scale-95"
            style={{ background: "radial-gradient(circle at 35% 30%, #fff8dc 0%, #f2c14e 45%, #b9800f 100%)" }}
            aria-label="Spin the wheel"
          >
            SPIN
          </button>
        ) : (
          <span
            className="absolute left-1/2 top-1/2 z-10 size-[17%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg ring-2 ring-[#8a6410]/60"
            style={{ background: "radial-gradient(circle at 35% 30%, #fff8dc 0%, #f2c14e 45%, #b9800f 100%)" }}
            aria-hidden
          />
        )}
      </div>

      {/* Stand */}
      <svg viewBox="0 0 200 34" className="relative z-0 mx-auto -mt-[5%] block w-[72%]" aria-hidden>
        <path d="M78 0 H122 L134 24 H66 Z" fill="#12304f" />
        <rect x="42" y="24" width="116" height="9" rx="2" fill="#0b2038" />
        <rect x="42" y="24" width="116" height="1.6" fill="#d9a21b" />
      </svg>
    </div>
  );
}

/** Spin sounds, synthesised in the browser (no audio files): a tick per wedge and a short win chime. */
function useSpinSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    try { if (window.localStorage.getItem(MUTE_KEY) === "1") { mutedRef.current = true; setMuted(true); } } catch { /* storage unavailable */ }
    return () => { void ctxRef.current?.close().catch(() => undefined); };
  }, []);

  const toggle = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    try { window.localStorage.setItem(MUTE_KEY, mutedRef.current ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  /** Must be called from a click, so the browser allows sound. */
  const unlock = useCallback(() => {
    if (mutedRef.current) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctxRef.current ??= new AC();
      void ctxRef.current.resume();
    } catch { /* no sound on this device */ }
  }, []);

  const tone = useCallback((freq: number, at: number, length: number, volume: number, type: OscillatorType) => {
    const ctx = ctxRef.current;
    if (!ctx || mutedRef.current) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
    } catch { /* ignore */ }
  }, []);

  const tick = useCallback(() => tone(1250, 0, 0.045, 0.12, "square"), [tone]);
  const win = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.32, 0.16, "triangle"));
    tone(1318.5, 0.46, 0.55, 0.12, "sine");
  }, [tone]);

  return { muted, toggle, unlock, tick, win };
}

/** Current rotation of an element in degrees (0–360), read from its computed transform. */
function currentAngle(el: Element): number {
  const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(el).transform);
  if (!m) return 0;
  const [a, b] = m[1].split(",").map(Number);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
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
  // At rest the gold voucher wedge sits upright just beside the pointer (never under it).
  const [rotation, setRotation] = useState(() => {
    const w = buildWedges(initialSegments, voucherAmount);
    const v = w.findIndex((x) => x.tone === "gold");
    return v < 0 || w.length < 3 ? 0 : 360 - (v + 1.5) * (360 / w.length);
  });
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const discRef = useRef<SVGSVGElement | null>(null);
  const sound = useSpinSound();
  const wedges = buildWedges(segments, voucherAmount);

  // Rotation that brings wedge `i` under the pointer (a one-wedge wheel keeps its label upright).
  const restAngle = (i: number, n: number) => (n === 1 ? 0 : 360 - (i + 0.5) * (360 / n));

  /** Plays a tick each time a wedge edge passes the pointer, until `until` (ms timestamp). */
  function tickWhileSpinning(wedgeCount: number, until: number) {
    const stepDeg = 360 / wedgeCount;
    let last = -1;
    let lastAt = 0;
    const frame = (now: number) => {
      const el = discRef.current;
      if (!el || performance.now() > until) return;
      const slot = Math.floor(currentAngle(el) / stepDeg);
      if (slot !== last && now - lastAt > 38) { last = slot; lastAt = now; sound.tick(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  const replace = useCallback((o: SpinOutcome) => setResults((rs) => rs.map((r) => (r.id === o.id ? o : r))), []);

  async function spin() {
    if (busy) return;
    sound.unlock();
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
    // The prize may be painted on two wedges: stop on either one of them.
    const painted = buildWedges(res.data.segments, voucherAmount);
    const matches = painted.map((w, i) => (w.segmentIndex === res.data.segmentIndex ? i : -1)).filter((i) => i >= 0);
    const stopAt = matches[Math.floor(Math.random() * matches.length)] ?? 0;
    const turns = Math.ceil(rotation / 360) * 360 + 360 * 6;
    setSpinning(true);
    setRotation(turns + restAngle(stopAt, painted.length));
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) tickWhileSpinning(painted.length, performance.now() + SPIN_MS);
    setTimeout(() => {
      sound.win();
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
        <div className="relative rounded-2xl bg-[radial-gradient(ellipse_at_center,#fbf6e6_0%,#efe6cf_100%)] px-3 pb-3 pt-4">
          <button
            type="button"
            onClick={sound.toggle}
            className="absolute right-2 top-2 z-20 grid size-8 place-items-center rounded-full bg-white/80 text-[#12304f] shadow-sm hover:bg-white"
            aria-label={sound.muted ? "Turn sound on" : "Turn sound off"}
            aria-pressed={!sound.muted}
          >
            {sound.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <Wheel
            wedges={wedges}
            rotation={rotation}
            spinning={spinning}
            busy={busy}
            onSpin={showSpin ? spin : undefined}
            discRef={discRef}
            label={`Prize wheel: ${segments.map((s) => (s.note ? `${s.label} (${s.note})` : s.label)).join(", ")}`}
          />
          {spinsPerOrder > 0 && (
            <p className="mx-auto mt-1 w-fit rounded-full bg-[#12304f] px-3 py-1 text-center text-[11px] font-semibold text-[#ffe08a]">
              Get {spinsPerOrder} free spin{spinsPerOrder === 1 ? "" : "s"} on every order
            </p>
          )}
        </div>

        <div className="text-center" aria-live="polite">
          {showSpin && (
            <>
              <p className="text-xl font-extrabold tracking-tight">{gift === "milestone" ? "Your gift voucher spin is here" : gift ? "A gift spin is waiting for you" : results.length ? "You have spins waiting" : "Your free spin is ready"}</p>
              <p className="mt-0.5 text-sm text-muted">{gift ? "Spin, then scratch the card to see your gift." : "Every spin wins a deal on your next order."}</p>
              {!gift && voucherEvery > 0 && <p className="mt-0.5 text-xs text-muted">The ₹{Math.round(voucherAmount / 100)} voucher is yours with every {voucherEvery}th delivered order.</p>}
              <Button size="lg" variant="accent" className="mt-3 w-full bg-gradient-to-r from-[#c8171a] to-[#8f1010] text-base font-extrabold tracking-wide text-[#ffe9a6] shadow-lg hover:from-[#b31417] hover:to-[#7a0c0c]" onClick={spin} loading={busy}>{busy ? "Spinning…" : "Spin now"}</Button>
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
              {voucherEvery > 0 && <p className="mt-0.5 text-xs text-muted">The ₹{Math.round(voucherAmount / 100)} voucher is yours with every {voucherEvery}th delivered order.</p>}
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
