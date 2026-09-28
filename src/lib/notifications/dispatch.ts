import "server-only";
import { after } from "next/server";
import type { NotificationChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { adapterFor } from "./adapters";
import type { AccountEvent, AdminEvent, CustomerEvent } from "./events";
import { alertRecipients, renderOrderAlert } from "./order-alert";
import { renderTemplate, type TemplateContext } from "./templates";

/**
 * Idempotent notification dispatcher.
 * - Every notification has a deterministic dedupe key (event + order + optional sub-key + channel),
 *   enforced by a UNIQUE index — so replayed webhooks or double submits can never notify twice.
 * - In-app rows are written synchronously; external sends happen after the response via `after()`.
 */

type OrderRef = { orderId: string; key?: string; extra?: Partial<TemplateContext> };

async function orderContext(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } },
      shipment: true,
      items: { select: { name: true, quantity: true } },
      payments: { where: { status: "PAID" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) return null;
  const settings = await getSettings();
  const expected = order.shipment?.estimatedDelivery
    ?? new Date(order.createdAt.getTime() + settings.estimatedDeliveryDays * 86400000);
  const ctx: TemplateContext = {
    storeName: settings.storeName,
    appUrl: appUrl(),
    customerName: order.customerName.split(" ")[0],
    orderNumber: order.orderNumber,
    amount: order.total,
    paymentId: order.payments[0]?.razorpayPaymentId ?? null,
    paymentMethod: order.paymentMethod,
    courier: order.shipment?.courier,
    trackingId: order.shipment?.trackingId,
    trackingUrl: order.shipment?.trackingUrl,
    expectedDelivery: formatDate(expected),
    itemsSummary: order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ").slice(0, 300),
  };
  return { order, settings, ctx };
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002";
}

async function createInApp(data: Prisma.NotificationUncheckedCreateInput) {
  try {
    await db.notification.create({ data });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

async function createDelivery(data: Prisma.NotificationDeliveryUncheckedCreateInput): Promise<string | null> {
  try {
    const row = await db.notificationDelivery.create({ data });
    return row.status === "PENDING" ? row.id : null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/** Sends pending deliveries. A delivery is "claimed" atomically (attempts 0 → 1) so it is sent once. */
export async function deliverPending(ids: string[]) {
  for (const id of ids) {
    const claimed = await db.notificationDelivery.updateMany({ where: { id, status: "PENDING", attempts: 0 }, data: { attempts: 1 } });
    if (claimed.count !== 1) continue;
    const d = await db.notificationDelivery.findUnique({ where: { id } });
    if (!d || d.channel === "IN_APP") continue;
    const adapter = adapterFor(d.channel);
    const html = d.channel === "EMAIL" ? d.body : null;
    const text = d.channel === "EMAIL" ? (d.subject ?? "") : d.body;
    const result = await adapter.send({ to: d.recipient, subject: d.subject, text, html });
    await db.notificationDelivery.update({
      where: { id },
      data: result.ok
        ? { status: "SENT", sentAt: new Date(), provider: adapter.provider, providerRef: result.providerRef ?? null }
        : { status: "FAILED", error: result.error.slice(0, 500), provider: adapter.provider },
    });
  }
}

function schedule(ids: string[]) {
  if (ids.length === 0) return;
  try {
    after(() => deliverPending(ids).catch((e) => console.error("[notify] delivery error", e)));
  } catch {
    // Outside a request (scripts/tests): send inline.
    void deliverPending(ids).catch((e) => console.error("[notify] delivery error", e));
  }
}

async function externalDeliveries(opts: {
  dedupeBase: string;
  event: string;
  user: { id: string; email: string; phone: string | null; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean };
  orderId?: string;
  rendered: ReturnType<typeof renderTemplate>;
  channels: { email: boolean; sms: boolean; whatsapp: boolean };
  transactional?: boolean;
}) {
  const ids: string[] = [];
  const plan: { channel: NotificationChannel; recipient: string | null; enabled: boolean }[] = [
    { channel: "EMAIL", recipient: opts.user.email, enabled: opts.channels.email && (opts.transactional || opts.user.emailOptIn) },
    { channel: "SMS", recipient: opts.user.phone, enabled: opts.channels.sms && opts.user.smsOptIn },
    { channel: "WHATSAPP", recipient: opts.user.phone, enabled: opts.channels.whatsapp && opts.user.whatsappOptIn },
  ];
  for (const p of plan) {
    if (!p.enabled || !p.recipient) continue;
    const adapter = adapterFor(p.channel as Exclude<NotificationChannel, "IN_APP">);
    const configured = adapter.configured();
    const id = await createDelivery({
      dedupeKey: `${opts.dedupeBase}:${p.channel}`,
      event: opts.event,
      channel: p.channel,
      recipient: p.recipient,
      subject: p.channel === "EMAIL" ? opts.rendered.emailSubject : null,
      body: p.channel === "EMAIL" ? opts.rendered.emailHtml : opts.rendered.sms,
      status: configured ? "PENDING" : "SKIPPED",
      error: configured ? null : `${adapter.provider} not configured`,
      provider: adapter.provider,
      userId: opts.user.id,
      orderId: opts.orderId ?? null,
    });
    if (id) ids.push(id);
  }
  return ids;
}

/** Customer notification for an order event (in-app + enabled external channels). */
export async function notifyCustomer(event: CustomerEvent, ref: OrderRef) {
  const loaded = await orderContext(ref.orderId);
  if (!loaded) return;
  const { order, settings } = loaded;
  const ctx = { ...loaded.ctx, ...ref.extra };
  const rendered = renderTemplate(event, ctx);
  const dedupeBase = `${event}:${order.id}${ref.key ? `:${ref.key}` : ""}`;
  await createInApp({
    audience: "CUSTOMER", userId: order.userId, event, title: rendered.title, body: rendered.body,
    link: rendered.link, dedupeKey: `${dedupeBase}:IN_APP`,
  });
  const ids = await externalDeliveries({
    dedupeBase, event, user: order.user, orderId: order.id, rendered, transactional: true,
    channels: { email: settings.emailNotifications, sms: settings.smsNotifications, whatsapp: settings.whatsappNotifications },
  });
  schedule(ids);
}

/**
 * Emails the full order (customer, phone, address, products with links, totals) to the owner's
 * order-alert address(es) from Admin → Settings. One email per order, deduplicated like everything else.
 */
export async function sendOrderAlert(orderId: string, kind: "COD" | "PAID") {
  const settings = await getSettings();
  const recipients = alertRecipients(settings.orderAlertEmail);
  if (recipients.length === 0) return;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { name: true, variantName: true, sku: true, quantity: true, unitPrice: true, lineTotal: true, product: { select: { slug: true, sourceName: true } } } },
      payments: { where: { status: "PAID" }, orderBy: { createdAt: "desc" }, take: 1, select: { razorpayPaymentId: true } },
    },
  });
  if (!order) return;
  const { subject, html } = renderOrderAlert({
    storeName: settings.storeName,
    appUrl: appUrl(),
    kind,
    order: {
      ...order,
      shippingAddress: (order.shippingAddress ?? {}) as Record<string, unknown>,
      razorpayPaymentId: order.payments[0]?.razorpayPaymentId ?? null,
      items: order.items.map((i) => ({ ...i, productSlug: i.product.slug, sourceName: i.product.sourceName })),
    },
  });
  const adapter = adapterFor("EMAIL");
  const configured = adapter.configured();
  const ids: string[] = [];
  for (const to of recipients) {
    const id = await createDelivery({
      dedupeKey: `ORDER_ALERT:${order.id}:${to}`,
      event: "ADMIN_ORDER_ALERT",
      channel: "EMAIL",
      recipient: to,
      subject,
      body: html,
      status: configured ? "PENDING" : "SKIPPED",
      error: configured ? null : `${adapter.provider} not configured`,
      provider: adapter.provider,
      userId: null,
      orderId: order.id,
    });
    if (id) ids.push(id);
  }
  schedule(ids);
}

/** Staff notification centre entry (shared inbox for admins/suppliers). */
export async function notifyAdmin(event: AdminEvent, opts: { orderId?: string; key?: string; extra?: Partial<TemplateContext> }) {
  let ctx: TemplateContext;
  if (opts.orderId) {
    const loaded = await orderContext(opts.orderId);
    if (!loaded) return;
    ctx = { ...loaded.ctx, customerName: loaded.order.customerName, ...opts.extra };
  } else {
    const settings = await getSettings();
    ctx = { storeName: settings.storeName, appUrl: appUrl(), ...opts.extra };
  }
  const rendered = renderTemplate(event, ctx);
  await createInApp({
    audience: "ADMIN", userId: null, event, title: rendered.title, body: rendered.body, link: rendered.link,
    dedupeKey: `${event}:${opts.orderId ?? "store"}${opts.key ? `:${opts.key}` : ""}:ADMIN`,
  });
  // A new order (COD placed, or online payment confirmed) is also emailed to the owner with full details.
  if (opts.orderId && (event === "ADMIN_COD_ORDER" || event === "ADMIN_NEW_ORDER")) {
    await sendOrderAlert(opts.orderId, event === "ADMIN_COD_ORDER" ? "COD" : "PAID").catch((err) => console.error("[notify] order alert failed", err));
  }
}

/** Account emails (welcome, password reset). */
export async function notifyAccount(event: AccountEvent, userId: string, extra: Partial<TemplateContext> & { key?: string } = {}) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const settings = await getSettings();
  const rendered = renderTemplate(event, { storeName: settings.storeName, appUrl: appUrl(), customerName: user.name.split(" ")[0], ...extra });
  const dedupeBase = `${event}:${user.id}${extra.key ? `:${extra.key}` : ""}`;
  if (event === "WELCOME") {
    await createInApp({ audience: "CUSTOMER", userId: user.id, event, title: rendered.title, body: rendered.body, link: "/", dedupeKey: `${dedupeBase}:IN_APP` });
  }
  const ids = await externalDeliveries({
    dedupeBase, event, user, rendered, transactional: true,
    channels: { email: true, sms: false, whatsapp: false },
  });
  schedule(ids);
}
