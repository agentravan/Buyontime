"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Gift, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { chooseReferralCodeAction, claimGiftAction } from "@/actions/referral";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Gift as GiftT, PendingGift, ReferralState } from "@/server/referral";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast.error("Could not copy — please note it down."); }
      }}
    >
      {done ? <Check className="text-emerald-600" /> : <Copy />} {label}
    </Button>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2.5 text-center">
      <p className="text-xl font-extrabold leading-tight">{value}</p>
      <p className="text-[11px] font-medium text-brand-100">{label}</p>
    </div>
  );
}

/** A wrapped gift: tapping it claims the reward and shows what was inside. */
function GiftCard({ pending, onOpened }: { pending: PendingGift; onOpened: (g: GiftT) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await claimGiftAction(pending.kind === "friend" ? { friendId: pending.friendId } : { milestone: pending.milestone });
        setBusy(false);
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(`You got ${formatINR(res.data.amount)} off!`);
        onOpened(res.data);
      }}
      className="group flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-saffron-400 bg-saffron-50 p-4 text-left transition hover:bg-saffron-100 disabled:opacity-70"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-saffron-400 to-saffron-600 text-white shadow-md transition group-hover:scale-105"><Gift className="size-6" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{pending.kind === "bonus" ? "Bonus gift" : "Surprise gift"}</span>
        <span className="block truncate text-xs text-muted">{pending.label}</span>
      </span>
      <span className="shrink-0 rounded-full bg-saffron-500 px-3 py-1.5 text-xs font-bold text-white">{busy ? "Opening…" : "Tap to open"}</span>
    </button>
  );
}

export function ReferPanel({ state, shareBase }: { state: ReferralState; shareBase: string }) {
  const router = useRouter();
  const [code, setCode] = useState(state.code);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.code);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<GiftT[]>([]);
  const [openedKeys, setOpenedKeys] = useState<string[]>([]);

  const link = `${shareBase}${code}`;
  const message = `I shop on Buyontime. Join with my code ${code} and take your free spin for a discount: ${link}`;
  const { totals, terms } = state;
  const inSet = totals.delivered % terms.every;
  const keyOf = (p: PendingGift) => (p.kind === "friend" ? `f:${p.friendId}` : `m:${p.milestone}`);
  const pending = state.pending.filter((p) => !openedKeys.includes(keyOf(p)));
  const openedIds = new Set(opened.map((g) => g.id));
  const gifts = [...opened, ...state.gifts.filter((g) => !openedIds.has(g.id))];

  async function save(next: string) {
    setSaving(true); setCodeError(null); setSuggestions([]);
    const res = await chooseReferralCodeAction(next);
    setSaving(false);
    if (!res.ok) { setCodeError(res.error); return; }
    if (!res.data.ok) { setCodeError(res.data.error); setSuggestions(res.data.suggestions); return; }
    setCode(res.data.code); setDraft(res.data.code); setEditing(false);
    toast.success("Your code is updated");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* What has actually happened so far */}
      <div className="rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-5 text-white sm:p-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Refer &amp; earn</h1>
        <p className="mt-1 text-sm text-brand-100">Share your code. When a friend&apos;s first order is delivered, you get a surprise gift.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={totals.joined} label="Friends joined" />
          <Stat value={totals.ordered} label="Friends who ordered" />
          <Stat value={totals.delivered} label="Orders delivered" />
          <Stat value={formatINR(totals.giftsValue)} label={`Gifts earned (${totals.giftsCount})`} />
        </div>
      </div>

      {/* Code and sharing */}
      <Card className="space-y-3 p-4 sm:p-5">
        <p className="text-sm font-bold">Your referral code</p>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-dashed border-brand-400 bg-brand-50 px-4 py-2 font-mono text-xl font-extrabold tracking-widest text-brand-800">{code}</span>
            <CopyButton text={code} label="Copy code" />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(true); setDraft(code); setCodeError(null); setSuggestions([]); }}>Change</Button>
          </div>
        ) : (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save(draft); }}>
            <div className="flex flex-wrap gap-2">
              <Input className="w-48 font-mono uppercase tracking-widest" value={draft} maxLength={12} autoCapitalize="characters" onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} aria-label="New referral code" />
              <Button type="submit" size="sm" className="h-10" loading={saving}>Save</Button>
              <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-muted">4 to 12 letters and numbers, with at least one letter.</p>
            {codeError && <p className="text-xs font-semibold text-red-600" role="alert">{codeError}</p>}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">Available:</span>
                {suggestions.map((s) => (
                  <button key={s} type="button" className="rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 font-mono font-bold text-brand-800 hover:bg-brand-100" onClick={() => void save(s)}>{s}</button>
                ))}
              </div>
            )}
          </form>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button asChild size="sm" className="bg-[#1faa53] hover:bg-[#188a43]">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle /> Share on WhatsApp</a>
          </Button>
          <CopyButton text={link} label="Copy link" />
        </div>
        <p className="break-all text-xs text-muted">{link}</p>
      </Card>

      {/* Sets of 3 */}
      <Card className="p-4 sm:p-5">
        <p className="text-sm font-bold">Bonus for every {terms.every} friends</p>
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: terms.every }).map((_, i) => (
            <span key={i} className={cn("grid size-10 place-items-center rounded-full border-2 text-sm font-extrabold", i < inSet ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-slate-50 text-muted")}>
              {i < inSet ? <Check className="size-5" /> : i + 1}
            </span>
          ))}
          <span className="ml-1 grid size-10 place-items-center rounded-full bg-gradient-to-b from-saffron-400 to-saffron-600 text-white"><Gift className="size-5" /></span>
        </div>
        <p className="mt-2 text-sm">
          {state.toNextBonus} more friend{state.toNextBonus === 1 ? "" : "s"} with a delivered order for your <b>{formatINR(terms.bonus)}</b> bonus gift.
        </p>
      </Card>

      {/* Gifts waiting to be opened */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">Gifts waiting for you ({pending.length})</p>
          {pending.map((p) => (
            <GiftCard key={keyOf(p)} pending={p} onOpened={(g) => { setOpened((o) => [g, ...o]); setOpenedKeys((k) => [...k, keyOf(p)]); router.refresh(); }} />
          ))}
        </div>
      )}

      {/* Gifts earned */}
      {gifts.length > 0 && (
        <Card className="p-4 sm:p-5">
          <p className="text-sm font-bold">Your gifts</p>
          <ul className="mt-2 divide-y divide-line">
            {gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="font-extrabold text-brand-800">{formatINR(g.amount)} off</span>
                <span className="text-xs text-muted">{g.label}</span>
                <span className="ml-auto flex items-center gap-2">
                  {g.used ? <Badge tone="gray">Used</Badge> : g.expired ? <Badge tone="gray">Expired</Badge> : g.code ? <><span className="font-mono text-sm font-bold">{g.code}</span><CopyButton text={g.code} label="Copy" /></> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Enter the code at checkout{terms.minOrder > 0 ? ` on an order of ${formatINR(terms.minOrder)} or more` : ""}. One code per order.</p>
        </Card>
      )}

      {/* Friends */}
      <Card className="p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-bold"><Users className="size-4" /> Your friends ({state.friends.length})</p>
        {state.friends.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No friends have joined yet. Share your code to get started.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {state.friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{f.name} <span className="text-xs text-muted">· joined {new Date(f.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span></span>
                <Badge tone={f.stage === "delivered" ? "green" : f.stage === "ordered" ? "blue" : "gray"}>{f.stage === "delivered" ? (f.rewarded ? "Delivered · gift opened" : "Delivered") : f.stage === "ordered" ? "Order placed" : "Joined"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 text-sm sm:p-5">
        <p className="font-bold">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Share your code or link. Your friend enters the code when creating their account.</li>
          <li>When your friend&apos;s first order is delivered, a surprise gift appears here: a coupon worth {formatINR(terms.min)} to {formatINR(terms.max)}.</li>
          <li>Every {terms.every} friends with a delivered order earn you a {formatINR(terms.bonus)} bonus coupon.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          Gifts are coupons for this store, valid {terms.validDays} days{terms.minOrder > 0 ? `, on orders of ${formatINR(terms.minOrder)} or more` : ""}; they cannot be exchanged for cash. Gifts are for friends you refer directly. Cancelled, returned and undelivered orders do not count.
        </p>
      </Card>
    </div>
  );
}
