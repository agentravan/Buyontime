import "server-only";
import type { NotificationChannel } from "@prisma/client";
import nodemailer from "nodemailer";
import { emailConfig, smtpConfig } from "@/lib/env";

/**
 * Channel adapters. Business logic only calls `adapterFor(channel).send(...)`, so a new provider
 * (MSG91, Twilio, Gupshup, Amazon SES…) can be added here without touching order or payment code.
 */

export type OutboundMessage = { to: string; subject?: string | null; text: string; html?: string | null };
export type SendResult = { ok: true; providerRef?: string } | { ok: false; error: string; retryable?: boolean };

export interface ChannelAdapter {
  channel: NotificationChannel;
  provider: string;
  configured(): boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

class ResendEmailAdapter implements ChannelAdapter {
  channel = "EMAIL" as const;
  provider = "resend";
  configured() { return Boolean(emailConfig().resendKey); }
  async send(msg: OutboundMessage): Promise<SendResult> {
    const cfg = { resendKey: emailConfig().resendKey, from: process.env.EMAIL_FROM || "Buyontime <onboarding@resend.dev>" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject ?? "", html: msg.html ?? undefined, text: msg.text }),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}`, retryable: res.status >= 500 };
      return { ok: true, providerRef: data.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "network error", retryable: true };
    }
  }
}

/** Sends through any SMTP mailbox (SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASSWORD / SMTP_FROM). */
class SmtpEmailAdapter implements ChannelAdapter {
  channel = "EMAIL" as const;
  provider = "smtp";
  configured() { return smtpConfig().configured; }
  async send(msg: OutboundMessage): Promise<SendResult> {
    const cfg = smtpConfig();
    try {
      const transport = nodemailer.createTransport({
        host: cfg.host, port: cfg.port, secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
      });
      const info = await transport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject ?? "", text: msg.text, html: msg.html ?? undefined });
      if (info.rejected.length > 0 && info.accepted.length === 0) return { ok: false, error: `recipient rejected: ${String(info.response).slice(0, 200)}` };
      return { ok: true, providerRef: info.messageId };
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      // A wrong password or sender will not fix itself; a timeout or dropped connection might.
      const retryable = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET", "EDNS"].includes(code);
      return { ok: false, error: `${code ? `${code}: ` : ""}${err instanceof Error ? err.message : "smtp error"}`, retryable };
    }
  }
}

/** Email goes through SMTP when it is configured, otherwise through Resend. */
class EmailAdapter implements ChannelAdapter {
  channel = "EMAIL" as const;
  private smtp = new SmtpEmailAdapter();
  private resend = new ResendEmailAdapter();
  private pick(): ChannelAdapter { return this.smtp.configured() ? this.smtp : this.resend; }
  get provider() { return this.pick().provider; }
  configured() { return this.pick().configured(); }
  send(msg: OutboundMessage) { return this.pick().send(msg); }
}

/**
 * Generic HTTP webhook adapter for SMS / WhatsApp. Point SMS_WEBHOOK_URL / WHATSAPP_WEBHOOK_URL at your
 * provider (or a small function that calls it). Payload: { to, text, channel }.
 */
class WebhookAdapter implements ChannelAdapter {
  constructor(public channel: "SMS" | "WHATSAPP", private envUrl: string, private envToken: string) {}
  provider = "webhook";
  configured() { return Boolean(process.env[this.envUrl]); }
  async send(msg: OutboundMessage): Promise<SendResult> {
    try {
      const res = await fetch(process.env[this.envUrl]!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env[this.envToken] ? { Authorization: `Bearer ${process.env[this.envToken]}` } : {}),
        },
        body: JSON.stringify({ to: msg.to, text: msg.text, channel: this.channel }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "network error", retryable: true };
    }
  }
}

const adapters: Record<Exclude<NotificationChannel, "IN_APP">, ChannelAdapter> = {
  EMAIL: new EmailAdapter(),
  SMS: new WebhookAdapter("SMS", "SMS_WEBHOOK_URL", "SMS_WEBHOOK_TOKEN"),
  WHATSAPP: new WebhookAdapter("WHATSAPP", "WHATSAPP_WEBHOOK_URL", "WHATSAPP_WEBHOOK_TOKEN"),
};

export function adapterFor(channel: Exclude<NotificationChannel, "IN_APP">): ChannelAdapter {
  return adapters[channel];
}
