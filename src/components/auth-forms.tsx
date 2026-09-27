"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm({ next, portal = "store" }: { next?: string; portal?: "store" | "admin" }) {
  const router = useRouter();
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
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password"><PasswordInput id="password" name="password" autoComplete="current-password" required /></Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
      {portal === "store" && (
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="font-semibold text-brand-700 hover:underline">Forgot password?</Link>
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Create account</Link>
        </div>
      )}
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
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
          name: String(fd.get("name")), email: String(fd.get("email")), phone: String(fd.get("phone")), password: String(fd.get("password")), next,
        });
        if (!res.ok) { setBusy(false); setErrors(res.fieldErrors ?? {}); setError(res.error); return; }
        toast.success("Welcome! Your account is ready.");
        router.replace(res.data.redirectTo);
        router.refresh();
      }}
    >
      <Field label="Full name" htmlFor="name" error={errors.name}><Input id="name" name="name" autoComplete="name" required /></Field>
      <Field label="Email" htmlFor="email" error={errors.email}><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="Used for delivery updates"><Input id="phone" name="phone" inputMode="tel" autoComplete="tel" required /></Field>
      <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number"><PasswordInput id="password" name="password" autoComplete="new-password" required /></Field>
      {error && !Object.keys(errors).length && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
      <p className="text-center text-sm">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{done}</p>;
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
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Button type="submit" className="w-full" size="lg" loading={busy}>Send reset link</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
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
      <Button type="submit" className="w-full" size="lg" loading={busy}>Update password</Button>
    </form>
  );
}
