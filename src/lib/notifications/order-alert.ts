import { formatINR } from "@/lib/money";

/**
 * "New order" alert emailed to the store owner (StoreSettings.orderAlertEmail) — everything needed to
 * fulfil the order without logging in: customer, phone, full address, each product with a link, totals.
 * Pure function (no server imports) so it can be unit-tested.
 */

export type OrderAlertInput = {
  storeName: string;
  appUrl: string;
  kind: "COD" | "PAID";
  order: {
    id: string;
    orderNumber: string;
    createdAt: Date;
    customerName: string;
    email: string;
    phone: string;
    shippingAddress: Record<string, unknown>;
    paymentMethod: string;
    paymentStatus: string;
    subtotal: number;
    discount: number;
    shippingFee: number;
    codFee: number;
    total: number;
    couponCode: string | null;
    customerNote: string | null;
    razorpayPaymentId?: string | null;
    items: { name: string; variantName: string | null; sku: string; quantity: number; unitPrice: number; lineTotal: number; productSlug: string; sourceName?: string | null }[];
  };
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

function addressLines(a: Record<string, unknown>): string[] {
  return [
    str(a.name),
    [str(a.line1), str(a.line2)].filter(Boolean).join(", "),
    str(a.landmark) ? `Landmark: ${str(a.landmark)}` : "",
    `${[str(a.city), str(a.state)].filter(Boolean).join(", ")} - ${str(a.pincode)}`,
  ].filter((l) => l && l !== " - ");
}

function istTime(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function renderOrderAlert({ storeName, appUrl, kind, order }: OrderAlertInput) {
  const base = appUrl.replace(/\/$/, "");
  const adminLink = `${base}/admin/orders/${order.id}`;
  const addrPhone = str(order.shippingAddress.phone) || order.phone;
  const address = addressLines(order.shippingAddress);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const payLine = kind === "COD"
    ? `Cash on Delivery — collect ${formatINR(order.total)}`
    : `Paid online (Razorpay${order.razorpayPaymentId ? ` ${order.razorpayPaymentId}` : ""}) — ${formatINR(order.total)}`;
  const subject = `${kind === "COD" ? "🛒 New COD order" : "✅ New paid order"} ${order.orderNumber} — ${order.customerName}, ${formatINR(order.total)}`;

  const productUrl = (slug: string) => `${base}/products/${slug}`;

  // Plain text (also what shows in notification previews).
  const text = [
    `${subject}`,
    ``,
    `Order: ${order.orderNumber}  (${istTime(order.createdAt)} IST)`,
    `Payment: ${payLine}`,
    ``,
    `CUSTOMER`,
    `Name: ${order.customerName}`,
    `Phone: ${addrPhone}${addrPhone !== order.phone ? ` (account: ${order.phone})` : ""}`,
    `Email: ${order.email}`,
    ``,
    `DELIVERY ADDRESS`,
    ...address,
    `Phone: ${addrPhone}`,
    ``,
    `PRODUCTS (${itemCount} item${itemCount === 1 ? "" : "s"})`,
    ...order.items.flatMap((i, n) => [
      `${n + 1}. ${i.name}${i.variantName && i.variantName !== "Default" ? ` — ${i.variantName}` : ""}`,
      `   Qty ${i.quantity} × ${formatINR(i.unitPrice)} = ${formatINR(i.lineTotal)}   SKU ${i.sku}${i.sourceName ? `   Source: ${i.sourceName}` : ""}`,
      `   ${productUrl(i.productSlug)}`,
    ]),
    ``,
    `Subtotal ${formatINR(order.subtotal)}`,
    ...(order.discount ? [`Discount${order.couponCode ? ` (${order.couponCode})` : ""} −${formatINR(order.discount)}`] : []),
    `Delivery ${order.shippingFee ? formatINR(order.shippingFee) : "FREE"}`,
    ...(order.codFee ? [`COD fee ${formatINR(order.codFee)}`] : []),
    `TOTAL ${formatINR(order.total)}`,
    ...(order.customerNote ? [``, `Customer note: ${order.customerNote}`] : []),
    ``,
    `Open in admin: ${adminLink}`,
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;color:#0f172a;font-size:14px">${value}</td></tr>`;
  const section = (title: string, inner: string) =>
    `<h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin:22px 0 8px">${esc(title)}</h2>${inner}`;
  const phoneLink = (p: string) => `<a href="tel:${esc(p.replace(/[^\d+]/g, ""))}" style="color:#0f172a;font-weight:700">${esc(p)}</a>`;

  const itemsHtml = order.items.map((i) => `
<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;vertical-align:top">
  <a href="${esc(productUrl(i.productSlug))}" style="color:#0f766e;font-weight:700;font-size:14px;text-decoration:none">${esc(i.name)}</a>
  ${i.variantName && i.variantName !== "Default" ? `<div style="font-size:13px;color:#334155">Size/option: <b>${esc(i.variantName)}</b></div>` : ""}
  <div style="font-size:12px;color:#64748b">SKU ${esc(i.sku)}${i.sourceName ? ` · Source: ${esc(i.sourceName)}` : ""}</div>
  <div style="font-size:12px"><a href="${esc(productUrl(i.productSlug))}" style="color:#0f766e">${esc(productUrl(i.productSlug))}</a></div>
</td><td style="padding:10px 0 10px 12px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap;vertical-align:top;font-size:14px">
  ${i.quantity} × ${esc(formatINR(i.unitPrice))}<br><b>${esc(formatINR(i.lineTotal))}</b>
</td></tr>`).join("");

  const totals = [
    ["Subtotal", formatINR(order.subtotal)],
    ...(order.discount ? [[`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`, `−${formatINR(order.discount)}`]] : []),
    ["Delivery", order.shippingFee ? formatINR(order.shippingFee) : "FREE"],
    ...(order.codFee ? [["COD fee", formatINR(order.codFee)]] : []),
  ].map(([l, v]) => `<tr><td style="padding:2px 0;font-size:14px;color:#475569">${esc(l)}</td><td style="padding:2px 0;font-size:14px;text-align:right">${esc(v)}</td></tr>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 10px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;padding:24px">
<tr><td>
<div style="font-size:18px;font-weight:800;color:#0f766e">${esc(storeName)}</div>
<h1 style="font-size:20px;color:#0f172a;margin:10px 0 4px">${kind === "COD" ? "New Cash on Delivery order" : "New paid order"} · ${esc(order.orderNumber)}</h1>
<p style="margin:0 0 6px;color:#64748b;font-size:13px">${esc(istTime(order.createdAt))} IST</p>
<p style="margin:10px 0;padding:10px 12px;border-radius:10px;font-size:14px;font-weight:700;background:${kind === "COD" ? "#fef3c7;color:#92400e" : "#dcfce7;color:#166534"}">${esc(payLine)}</p>
${section("Customer", `<table cellpadding="0" cellspacing="0">${row("Name", `<b>${esc(order.customerName)}</b>`)}${row("Phone", phoneLink(addrPhone))}${addrPhone !== order.phone ? row("Account phone", phoneLink(order.phone)) : ""}${row("Email", `<a href="mailto:${esc(order.email)}" style="color:#0f172a">${esc(order.email)}</a>`)}</table>`)}
${section("Delivery address", `<div style="font-size:14px;line-height:1.55;color:#0f172a;background:#f8fafc;border-radius:10px;padding:10px 12px">${address.map(esc).join("<br>")}<br>Phone: ${phoneLink(addrPhone)}</div>`)}
${section(`Products (${itemCount})`, `<table width="100%" cellpadding="0" cellspacing="0">${itemsHtml}</table>`)}
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px">${totals}
<tr><td style="padding:6px 0 0;font-size:16px;font-weight:800">Total</td><td style="padding:6px 0 0;font-size:16px;font-weight:800;text-align:right">${esc(formatINR(order.total))}</td></tr></table>
${order.customerNote ? section("Customer note", `<p style="margin:0;font-size:14px">${esc(order.customerNote)}</p>`) : ""}
<p style="margin:22px 0 4px"><a href="${esc(adminLink)}" style="background:#0f766e;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Open order in admin</a></p>
<p style="margin:18px 0 0;color:#94a3b8;font-size:12px">Sent to the order-alert address set in Admin → Settings. Contains customer personal data — do not forward.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, html, text };
}

/** Parses the comma/space separated recipient list from settings. */
export function alertRecipients(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    .slice(0, 5);
}
