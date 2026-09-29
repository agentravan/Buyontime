/**
 * Flowing light streaks drawn in SVG — an original, lightweight take on the "glossy ribbons of light"
 * look. A few KB instead of a large background photo; animation is transform/stroke only.
 */
type Palette = { base: string; ribbon: string; hot: string; cool: string };

export const FLOW_PALETTES: Record<"teal" | "gold" | "hero", Palette> = {
  teal: { base: "#021f1c", ribbon: "#12726a", hot: "#ffb94a", cool: "#57d6c1" },
  gold: { base: "#060608", ribbon: "#3a3328", hot: "#f5a524", cool: "#fde68a" },
  hero: { base: "#053a35", ribbon: "#0f8074", hot: "#ffb94a", cool: "#94ead9" },
};

const RIBBONS = [
  "M-120 520 C 180 300, 420 640, 760 380 S 1260 120, 1560 260",
  "M-160 640 C 200 420, 520 760, 820 500 S 1280 260, 1600 420",
  "M-100 300 C 260 120, 520 420, 860 220 S 1300 20, 1580 120",
  "M-140 760 C 240 620, 560 900, 900 660 S 1320 460, 1620 600",
];

export function FlowLines({ palette = "teal", className = "", animated = true }: { palette?: keyof typeof FLOW_PALETTES; className?: string; animated?: boolean }) {
  const p = FLOW_PALETTES[palette];
  const id = `flow-${palette}`;
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} style={{ background: p.base }}>
      {/* Soft glows */}
      <div className="absolute -left-1/4 top-1/4 size-[70vmax] rounded-full opacity-40" style={{ background: `radial-gradient(circle, ${p.ribbon} 0%, transparent 60%)` }} />
      <div className={`absolute -right-1/4 -top-1/4 size-[60vmax] rounded-full opacity-30 ${animated ? "animate-float" : ""}`} style={{ background: `radial-gradient(circle, ${p.hot} 0%, transparent 55%)` }} />
      <svg
        className={`absolute inset-[-10%] h-[120%] w-[120%] ${animated ? "animate-drift" : ""}`}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${id}-hot`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={p.hot} stopOpacity="0" />
            <stop offset="0.45" stopColor={p.hot} stopOpacity="0.95" />
            <stop offset="0.6" stopColor={p.cool} stopOpacity="0.9" />
            <stop offset="1" stopColor={p.hot} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-ribbon`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={p.ribbon} stopOpacity="0.95" />
            <stop offset="1" stopColor={p.base} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {/* Wide dark glossy ribbons */}
        {RIBBONS.map((d, i) => (
          <path key={`r${i}`} d={d} fill="none" stroke={`url(#${id}-ribbon)`} strokeWidth={110 - i * 16} strokeLinecap="round" opacity={0.85 - i * 0.12} />
        ))}
        {/* Soft bloom under the main light streak (no blur filter, so it stays cheap) */}
        <path d={RIBBONS[0]} fill="none" stroke={`url(#${id}-hot)`} strokeWidth={18} strokeLinecap="round" opacity={0.18} />
        <path d={RIBBONS[1]} fill="none" stroke={`url(#${id}-hot)`} strokeWidth={10} strokeLinecap="round" opacity={0.12} />
        {/* Thin bright light streaks that travel along the ribbons */}
        {RIBBONS.map((d, i) => (
          <path
            key={`s${i}`}
            d={d}
            fill="none"
            stroke={`url(#${id}-hot)`}
            strokeWidth={i === 0 ? 4.5 : 2.4}
            strokeLinecap="round"
            strokeDasharray="520 1080"
            style={animated ? { animation: `streak ${9 + i * 3}s linear ${i * -2.5}s infinite` } : undefined}
            opacity={0.9 - i * 0.15}
          />
        ))}
      </svg>
      {/* Vignette for legibility */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 30%, ${p.base} 95%)`, opacity: 0.45 }} />
    </div>
  );
}
