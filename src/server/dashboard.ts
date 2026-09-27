import "server-only";
import type { StoreSettings } from "@prisma/client";
import { db } from "@/lib/db";
import { orderProfit, profitInclude } from "./profit";

const BOOKED = { notIn: ["PENDING_PAYMENT", "CANCELLED", "RTO"] as ("PENDING_PAYMENT" | "CANCELLED" | "RTO")[] };

function istStartOfDay(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600000);
}

export async function dashboardData(settings: StoreSettings, withFinance: boolean) {
  const today = istStartOfDay();
  const week = new Date(today.getTime() - 6 * 86400000);
  const monthStart = new Date(today);
  const ist = new Date(today.getTime() + 5.5 * 3600000);
  monthStart.setTime(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600000);
  const thirty = new Date(today.getTime() - 29 * 86400000);

  const sumBooked = (from: Date) => db.order.aggregate({ where: { status: BOOKED, createdAt: { gte: from } }, _sum: { total: true }, _count: { _all: true } });

  const [
    revToday, revWeek, revMonth, statusCounts, paymentCounts, methodCounts,
    customers, newCustomers, products, variants, pendingReturns, refundsMonth,
    attention, mismatches, activity,
  ] = await Promise.all([
    sumBooked(today), sumBooked(week), sumBooked(monthStart),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.groupBy({ by: ["paymentStatus"], where: { status: { not: "PENDING_PAYMENT" } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["paymentMethod"], where: { status: BOOKED }, _count: { _all: true } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: thirty } } }),
    db.product.count({ where: { deletedAt: null } }),
    db.productVariant.findMany({ where: { isActive: true, product: { deletedAt: null, status: "ACTIVE" } }, select: { stock: true, product: { select: { lowStockThreshold: true } } } }),
    db.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } } }),
    db.refund.aggregate({ where: { status: "PROCESSED", processedAt: { gte: monthStart } }, _sum: { amount: true }, _count: { _all: true } }),
    db.order.findMany({ where: { needsAttention: { not: null } }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, orderNumber: true, needsAttention: true } }),
    db.payment.count({ where: { reconciliationStatus: "MISMATCH" } }),
    db.orderEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { order: { select: { id: true, orderNumber: true } } } }),
  ]);

  const returningRows = await db.order.groupBy({ by: ["userId"], where: { status: BOOKED }, _count: { _all: true }, _sum: { total: true } });
  const returning = returningRows.filter((r) => r._count._all > 1).length;
  const vip = returningRows.filter((r) => (r._sum.total ?? 0) >= settings.vipLifetimeSpend).length;

  const count = (rows: { _count: { _all: number } }[], pick: (r: never) => boolean) => rows.filter((r) => pick(r as never)).reduce((s, r) => s + r._count._all, 0);
  const st = (s: string[]) => count(statusCounts, (r: { status: string }) => s.includes(r.status));
  const pay = (s: string[]) => count(paymentCounts, (r: { paymentStatus: string }) => s.includes(r.paymentStatus));

  // 30-day chart (IST days)
  const series = await db.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
    SELECT date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS day,
           COALESCE(SUM(total), 0)::bigint AS revenue, COUNT(*)::bigint AS orders
    FROM "Order"
    WHERE "createdAt" >= ${thirty} AND status NOT IN ('PENDING_PAYMENT', 'CANCELLED', 'RTO')
    GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(series.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
  const chart = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(thirty.getTime() + i * 86400000 + 5.5 * 3600000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    return { day: key.slice(5), revenue: Number(row?.revenue ?? 0) / 100, orders: Number(row?.orders ?? 0) };
  });

  // Month profit (bounded)
  let profit = { revenue: 0, costs: 0, profit: 0, margin: 0, orders: 0 };
  if (withFinance) {
    const monthOrders = await db.order.findMany({ where: { createdAt: { gte: monthStart }, status: { not: "PENDING_PAYMENT" } }, include: profitInclude, take: 3000 });
    for (const o of monthOrders) {
      const p = orderProfit(o, settings);
      profit.revenue += p.revenue;
      profit.costs += p.costs;
      profit.profit += p.profit;
      profit.orders++;
    }
    profit.margin = profit.revenue > 0 ? Math.round((profit.profit / profit.revenue) * 1000) / 10 : 0;
  } else {
    profit = { revenue: 0, costs: 0, profit: 0, margin: 0, orders: 0 };
  }

  const low = variants.filter((v) => v.stock > 0 && v.stock <= v.product.lowStockThreshold).length;
  const out = variants.filter((v) => v.stock <= 0).length;

  return {
    revenue: {
      today: revToday._sum.total ?? 0, todayOrders: revToday._count._all,
      week: revWeek._sum.total ?? 0, weekOrders: revWeek._count._all,
      month: revMonth._sum.total ?? 0, monthOrders: revMonth._count._all,
    },
    orders: {
      new: st(["CONFIRMED"]), processing: st(["PROCESSING"]), shipped: st(["SHIPPED", "OUT_FOR_DELIVERY"]),
      delivered: st(["DELIVERED"]), cancelled: st(["CANCELLED"]), returned: st(["RETURN_REQUESTED", "RETURNED", "RTO"]),
      awaitingPayment: st(["PENDING_PAYMENT"]), total: count(statusCounts, () => true),
    },
    payments: { paid: pay(["PAID"]), pending: pay(["PENDING", "AUTHORIZED"]), failed: pay(["FAILED"]), refunded: pay(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"]) },
    methods: {
      cod: methodCounts.find((m) => m.paymentMethod === "COD")?._count._all ?? 0,
      online: methodCounts.find((m) => m.paymentMethod === "ONLINE")?._count._all ?? 0,
    },
    customers: { total: customers, new30: newCustomers, returning, vip },
    inventory: { products, low, out },
    returns: { pending: pendingReturns, refundedMonth: refundsMonth._sum.amount ?? 0, refundCount: refundsMonth._count._all },
    profit,
    attention,
    mismatches,
    activity,
    chart,
  };
}
