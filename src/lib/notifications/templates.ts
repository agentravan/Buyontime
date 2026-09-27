import { formatINR } from "@/lib/money";
import type { NotificationEvent } from "./events";

export type TemplateContext = {
  storeName: string;
  appUrl: string;
  customerName?: string;
  orderNumber?: string;
  amount?: number;
  paymentId?: string | null;
  paymentMethod?: string;
  courier?: string | null;
  trackingId?: string | null;
  trackingUrl?: string | null;
  reason?: string | null;
  productName?: string;
  stock?: number;
  resetUrl?: string;
  expectedDelivery?: string | null;
  itemsSummary?: string;
};

export type RenderedMessage = { title: string; body: string; link?: string; emailSubject: string; emailHtml: string; sms: string };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailShell(ctx: TemplateContext, heading: string, paragraphs: string[], cta?: { label: string; href: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6">${esc(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:20px 0"><a href="${esc(cta.href)}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px">
<tr><td><div style="font-size:20px;font-weight:800;color:#0f766e;margin-bottom:18px">${esc(ctx.storeName)}</div>
<h1 style="font-size:20px;color:#0f172a;margin:0 0 14px">${esc(heading)}</h1>${body}${button}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">You are receiving this because you have an account at ${esc(ctx.storeName)}.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderTemplate(event: NotificationEvent, ctx: TemplateContext): RenderedMessage {
  const on = ctx.orderNumber ?? "";
  const amt = ctx.amount !== undefined ? formatINR(ctx.amount) : "";
  const orderLink = ctx.orderNumber ? `/account/orders/${ctx.orderNumber}` : "/account/orders";
  const adminLink = ctx.orderNumber ? `/admin/orders?q=${ctx.orderNumber}` : "/admin/orders";
  const hi = ctx.customerName ? `Hi ${ctx.customerName},` : "Hello,";
  const abs = (p: string) => `${ctx.appUrl}${p}`;

  const make = (title: string, body: string, link: string, extra: string[] = [], cta = "View order"): RenderedMessage => ({
    title,
    body,
    link,
    emailSubject: `${title}${on ? ` — ${on}` : ""} | ${ctx.storeName}`,
    emailHtml: emailShell(ctx, title, [hi, body, ...extra], { label: cta, href: abs(link) }),
    sms: `${ctx.storeName}: ${body}`.slice(0, 300),
  });

  switch (event) {
    case "ORDER_CREATED":
      return make("Order placed", `We have received your order ${on} for ${amt}${ctx.paymentMethod === "COD" ? " (Cash on Delivery)" : ""}.`, orderLink,
        ctx.itemsSummary ? [`Items: ${ctx.itemsSummary}`] : []);
    case "PAYMENT_SUCCESS":
      return make("Payment successful", `Your payment of ${amt} for order ${on} was received${ctx.paymentId ? ` (Payment ID ${ctx.paymentId})` : ""}.`, orderLink,
        ctx.expectedDelivery ? [`Expected delivery: ${ctx.expectedDelivery}.`] : []);
    case "PAYMENT_FAILED":
      return make("Payment failed", `The payment for order ${on} did not go through${ctx.reason ? `: ${ctx.reason}` : ""}. You can retry from your order page. No money was taken for the failed attempt.`, orderLink, [], "Retry payment");
    case "ORDER_CONFIRMED":
      return make("Order confirmed", `Your order ${on} is confirmed and will be packed soon.`, orderLink);
    case "ORDER_PROCESSING":
      return make("Order is being packed", `We are preparing your order ${on} for dispatch.`, orderLink);
    case "ORDER_SHIPPED":
      return make("Order shipped", `Your order ${on} has been shipped${ctx.courier ? ` via ${ctx.courier}` : ""}${ctx.trackingId ? ` (tracking ${ctx.trackingId})` : ""}.`, orderLink,
        ctx.trackingUrl ? [`Track it here: ${ctx.trackingUrl}`] : [], "Track order");
    case "OUT_FOR_DELIVERY":
      return make("Out for delivery", `Your order ${on} is out for delivery today.${ctx.paymentMethod === "COD" ? ` Please keep ${amt} ready.` : ""}`, orderLink, [], "Track order");
    case "ORDER_DELIVERED":
      return make("Delivered", `Your order ${on} has been delivered. We hope you love it!`, orderLink, [], "Rate your purchase");
    case "ORDER_CANCELLED":
      return make("Order cancelled", `Your order ${on} has been cancelled${ctx.reason ? ` (${ctx.reason})` : ""}.`, orderLink);
    case "RETURN_REQUESTED":
      return make("Return request received", `We received your return request for order ${on}. We'll review it shortly.`, orderLink);
    case "REFUND_INITIATED":
      return make("Refund initiated", `A refund of ${amt} for order ${on} has been initiated. Online refunds usually reach your account in 5–7 working days.`, orderLink);
    case "REFUND_COMPLETED":
      return make("Refund completed", `Your refund of ${amt} for order ${on} has been processed.`, orderLink);
    case "WELCOME":
      return make(`Welcome to ${ctx.storeName}`, "Your account is ready. Happy shopping!", "/", [], "Start shopping");
    case "PASSWORD_RESET":
      return {
        title: "Reset your password",
        body: "Use the link in this email to set a new password. It expires in 30 minutes.",
        link: "/login",
        emailSubject: `Reset your password | ${ctx.storeName}`,
        emailHtml: emailShell(ctx, "Reset your password", [hi, "We received a request to reset your password. This link expires in 30 minutes. If you did not request it, you can ignore this email."], { label: "Set a new password", href: ctx.resetUrl ?? abs("/forgot-password") }),
        sms: "",
      };
    case "ADMIN_NEW_ORDER":
      return make("New order", `New order ${on} for ${amt} (${ctx.paymentMethod === "COD" ? "COD" : "Online"}) from ${ctx.customerName ?? "a customer"}.`, adminLink);
    case "ADMIN_COD_ORDER":
      return make("COD order received", `COD order ${on} for ${amt} from ${ctx.customerName ?? "a customer"} is confirmed and ready to fulfil.`, adminLink);
    case "ADMIN_PAYMENT_RECEIVED":
      return make("Payment received", `${amt} received for order ${on}${ctx.paymentId ? ` (${ctx.paymentId})` : ""}.`, adminLink);
    case "ADMIN_PAYMENT_FAILED":
      return make("Payment failed", `A payment attempt for order ${on} failed${ctx.reason ? `: ${ctx.reason}` : ""}.`, adminLink);
    case "ADMIN_LOW_STOCK":
      return make("Low stock", `${ctx.productName} has only ${ctx.stock} left in stock.`, "/admin/inventory?filter=low");
    case "ADMIN_RETURN_REQUEST":
      return make("Return request", `Return requested for order ${on}: ${ctx.reason ?? ""}`, "/admin/returns");
    case "ADMIN_REFUND_UPDATE":
      return make("Refund update", `Refund of ${amt} for order ${on}: ${ctx.reason ?? "updated"}.`, adminLink);
    case "ADMIN_COMPLAINT":
      return make("Customer complaint", `${ctx.customerName ?? "A customer"} raised a complaint${on ? ` about ${on}` : ""}.`, "/admin/customers");
    case "ADMIN_ATTENTION":
      return make("Action required", `Order ${on} needs attention: ${ctx.reason ?? ""}`, adminLink);
  }
}
