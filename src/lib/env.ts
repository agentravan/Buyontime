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

export function storageDriver(): "cloudinary" | "blob" | "local" {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return "cloudinary";
  }
  // Vercel Blob: connecting a Blob store to the Vercel project injects BLOB_READ_WRITE_TOKEN automatically.
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "local";
}

/** SMTP mailbox (Gmail, Zoho, Hostinger, …) from the SMTP_* environment variables. */
export function smtpConfig() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? "";
  const port = Number(process.env.SMTP_PORT) || 587;
  const flag = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
  return {
    host, port, user, pass,
    // Port 465 is TLS from the first byte; 587 / 25 start plain and upgrade (STARTTLS).
    secure: flag ? ["1", "true", "yes", "ssl", "tls"].includes(flag) && port !== 587 : port === 465,
    from: (process.env.SMTP_FROM ?? "").trim() || user,
    configured: Boolean(host && user && pass),
  };
}

/** Which service sends email: SMTP when its variables are set, otherwise Resend. */
export function emailConfig() {
  const smtp = smtpConfig();
  const resendKey = process.env.RESEND_API_KEY ?? "";
  const provider: "smtp" | "resend" | null = smtp.configured ? "smtp" : resendKey ? "resend" : null;
  return {
    provider,
    resendKey,
    // Without a verified domain, Resend's shared sender works — but only delivers to the Resend account's own email.
    from: provider === "smtp" ? smtp.from : process.env.EMAIL_FROM || "Buyontime <onboarding@resend.dev>",
    configured: provider !== null,
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
