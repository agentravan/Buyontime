/**
 * Central place for reading environment configuration.
 * Server-only secrets must never be imported into client components.
 */

export function appUrl(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const isProduction = process.env.NODE_ENV === "production";

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  return {
    keyId,
    keySecret,
    webhookSecret,
    /** Overridable only for automated tests against a local gateway double. */
    apiBase: (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1").replace(/\/$/, ""),
    configured: Boolean(keyId && keySecret),
    webhookConfigured: Boolean(webhookSecret),
    mode: keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown",
  } as const;
}

export function storageDriver(): "cloudinary" | "local" {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return "cloudinary";
  }
  return "local";
}

export function emailConfig() {
  return {
    resendKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "",
    configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  };
}

export function sessionSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (isProduction) throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
    return "dev-only-insecure-secret-change-me-please-0000";
  }
  return s;
}
