"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useHydrated } from "@/components/use-hydrated";
import { MorphLink } from "@/components/motion/morph-card";

type IconType = React.ComponentType<{ className?: string }>;

/** Input with a leading icon (decorative; the visible label names the field). */
function IconInput({ icon: Icon, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: IconType }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Icon className="size-4" /></span>
      <Input {...props} className={`pl-10 ${className ?? ""}`} />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Lock className="size-4" /></span>
      <Input {...props} type={show ? "text" : "password"} className="pl-10 pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-current" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SubmitButton({ children, busy, disabled }: { children: React.ReactNode; busy: boolean; disabled: boolean }) {
  return (
    <Button type="submit" data-auth-submit className="press sheen w-full" size="lg" loading={busy} disabled={disabled}>
      {children} {!busy && <ArrowRight aria-hidden className="size-4" />}
    </Button>
  );
}

/** "Don't have an account? Sign up" — folds the card before switching to the other form. */
export function AuthSwitch({ to, next }: { to: "login" | "register"; next?: string }) {
  const href = `/${to}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return to === "register" ? (
    <>New to Buyontime? <MorphLink href={href} className="auth-link font-bold hover:underline">Create an account</MorphLink></>
  ) : (
    <>Already have an account? <MorphLink href={href} className="auth-link font-bold hover:underline">Sign in</MorphLink></>
  );
}

export function LoginForm({ next, portal = "store" }: { next?: string; portal?: "store" | "admin" }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const res = await loginAction({ email: String(fd.get("email")), password: String(fd.get("password")), next, portal });
        if (!res.ok) { setBusy(false); setError(res.error); return; }
        router.replace(res.data.redirectTo);
        router.refresh();
      }}
    >
      <Field label="Email" htmlFor="email"><IconInput icon={Mail} id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="auth-label text-sm font-medium text-slate-700">Password</label>
          {portal === "store" && <Link href="/forgot-password" className="auth-link text-xs font-semibold text-brand-700 hover:underline">Forgot password?</Link>}
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <SubmitButton busy={busy} disabled={!hydrated}>Sign in</SubmitButton>
    </form>
  );
}

export function RegisterForm({ next, referralCode }: { next?: string; referralCode?: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const res = await registerAction({
          name: String(fd.get("name")), email: String(fd.get("email")), phone: String(fd.get("phone")), password: String(fd.get("password")), next, ref: String(fd.get("ref") ?? ""),
        });
        if (!res.ok) { setBusy(false); setErrors(res.fieldErrors ?? {}); setError(res.error); return; }
        toast.success("Welcome! Your account is ready.");
        router.replace(res.data.redirectTo);
        router.refresh();
      }}
    >
      <Field label="Full name" htmlFor="name" error={errors.name}><IconInput icon={User} id="name" name="name" autoComplete="name" placeholder="Your name" required /></Field>
      <Field label="Email" htmlFor="email" error={errors.email}><IconInput icon={Mail} id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field>
      <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="For delivery updates and Cash on Delivery"><IconInput icon={Phone} id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" required /></Field>
      <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number"><PasswordInput id="password" name="password" autoComplete="new-password" required /></Field>
      <Field label="Friend's referral code (optional)" htmlFor="ref"><Input id="ref" name="ref" defaultValue={referralCode ?? ""} autoCapitalize="characters" autoComplete="off" maxLength={14} placeholder="e.g. PRIYA21" className="uppercase" /></Field>
      {error && !Object.keys(errors).length && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <SubmitButton busy={busy} disabled={!hydrated}>Create account</SubmitButton>
      <p className="text-center text-xs text-muted">By creating an account you agree to our <Link href="/policies/terms" className="auth-link hover:underline">Terms</Link> and <Link href="/policies/privacy" className="auth-link hover:underline">Privacy policy</Link>.</p>
    </form>
  );
}

export function ForgotForm() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="rounded-lg bg-emerald-500/15 p-3 text-sm text-emerald-100">{done}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await forgotPasswordAction({ email: String(new FormData(e.currentTarget).get("email")) });
        setBusy(false);
        if (!res.ok) toast.error(res.error);
        else setDone(res.message ?? "Check your email.");
      }}
    >
      <Field label="Email" htmlFor="email"><IconInput icon={Mail} id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field>
      <SubmitButton busy={busy} disabled={!hydrated}>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("password") !== fd.get("confirm")) { toast.error("Passwords do not match."); return; }
        setBusy(true);
        const res = await resetPasswordAction({ token, password: String(fd.get("password")) });
        setBusy(false);
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(res.message ?? "Password updated");
        router.replace("/login");
      }}
    >
      <Field label="New password" htmlFor="password" hint="At least 8 characters with a letter and a number"><PasswordInput id="password" name="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm password" htmlFor="confirm"><PasswordInput id="confirm" name="confirm" autoComplete="new-password" required /></Field>
      <SubmitButton busy={busy} disabled={!hydrated}>Update password</SubmitButton>
    </form>
  );
}
