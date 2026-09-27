/** All money is stored in paise. These helpers convert and format for display. */

export function toPaise(rupees: number | string): number {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

export function discountPercent(mrp: number, price: number): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

/** GST contained in a GST-inclusive amount. */
export function gstIncluded(amountInclusive: number, ratePct: number): number {
  if (ratePct <= 0) return 0;
  return Math.round((amountInclusive * ratePct) / (100 + ratePct));
}

export function bpsOf(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10000);
}
