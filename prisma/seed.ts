/**
 * Demo / seed data. Idempotent: safe to run more than once.
 *   npm run db:seed
 * Demo passwords come from SEED_*_PASSWORD env vars. Development falls back to documented demo passwords;
 * in production the env vars are REQUIRED so no known password is ever deployed.
 *
 * SEED_SCOPE=catalog loads ONLY store settings, categories, sample products and coupons — no demo users,
 * addresses or orders. Use it for a live store; create the owner's login with `npm run db:create-admin`.
 */
import { PrismaClient, type PaymentOption, type User } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const isProd = process.env.NODE_ENV === "production";
const catalogOnly = process.env.SEED_SCOPE === "catalog";

function password(envKey: string, fallback: string): string {
  const v = process.env[envKey];
  if (v) return v;
  if (isProd) throw new Error(`${envKey} must be set when seeding a production database.`);
  return fallback;
}

const rs = (rupees: number) => Math.round(rupees * 100);

const CATEGORIES = [
  { slug: "womens-fashion", name: "Women's Fashion", image: "/seed/cat-women.svg" },
  { slug: "mens-fashion", name: "Men's Fashion", image: "/seed/cat-men.svg" },
  { slug: "home-kitchen", name: "Home & Kitchen", image: "/seed/cat-home.svg" },
  { slug: "beauty", name: "Beauty & Personal Care", image: "/seed/cat-beauty.svg" },
  { slug: "electronics", name: "Electronics Accessories", image: "/seed/cat-electronics.svg" },
  { slug: "footwear", name: "Footwear", image: "/seed/cat-footwear.svg" },
  { slug: "kids-toys", name: "Kids & Toys", image: "/seed/cat-kids.svg" },
  { slug: "jewellery", name: "Jewellery & Accessories", image: "/seed/cat-jewellery.svg" },
];

type SeedProduct = {
  sku: string; name: string; brand: string; cat: string; price: number; mrp: number; cost: number; ship: number; gst: number;
  stock: number; images: string[]; pay?: PaymentOption; featured?: boolean; variants?: { name: string; stock: number }[];
  specs: [string, string][]; desc: string; source?: string;
};

const PRODUCTS: SeedProduct[] = [
  // ── Payment-method test products (see README "Payment method test") ──
  { sku: "BOT-EAR-001", name: "Aurora Pro Wireless Earbuds with ENC", brand: "Soundwave", cat: "electronics", price: 1499, mrp: 3999, cost: 780, ship: 60, gst: 18, stock: 40, images: ["earbuds"], pay: "ONLINE_ONLY", featured: true,
    specs: [["Battery", "Up to 30 hours with case"], ["Bluetooth", "5.3"], ["Warranty", "6 months"]], desc: "Crystal-clear calls with environmental noise cancellation, 30-hour total playback and a pocket-sized charging case. Prepaid orders only for this product." },
  { sku: "BOT-KUR-001", name: "Hand-block Printed Cotton Kurta", brand: "Rangsutra", cat: "womens-fashion", price: 699, mrp: 1599, cost: 320, ship: 55, gst: 5, stock: 0, images: ["kurta-rose", "kurta-teal"], pay: "COD_ONLY", featured: true,
    variants: [{ name: "S", stock: 8 }, { name: "M", stock: 12 }, { name: "L", stock: 10 }, { name: "XL", stock: 4 }],
    specs: [["Fabric", "100% cotton"], ["Fit", "Straight"], ["Wash care", "Hand wash cold"]], desc: "Breathable pure-cotton kurta with traditional hand-block print, three-quarter sleeves and side slits. Available on Cash on Delivery only.", source: "Local supplier (Jaipur)" },
  { sku: "BOT-BTL-001", name: "Insulated Steel Water Bottle 1L", brand: "HydroKeep", cat: "home-kitchen", price: 549, mrp: 999, cost: 240, ship: 50, gst: 18, stock: 60, images: ["bottle"], pay: "ONLINE_AND_COD", featured: true,
    specs: [["Capacity", "1 litre"], ["Keeps cold", "24 hours"], ["Material", "Food-grade 304 steel"]], desc: "Double-wall vacuum insulated bottle that keeps drinks cold for 24 hours and hot for 12. Leak-proof lid, fits most car cup holders." },
  // ── Catalogue ──
  { sku: "BOT-KUR-002", name: "Rayon Anarkali Kurta with Dupatta", brand: "Rangsutra", cat: "womens-fashion", price: 899, mrp: 2199, cost: 430, ship: 60, gst: 5, stock: 0, images: ["kurta-teal"], variants: [{ name: "S", stock: 6 }, { name: "M", stock: 9 }, { name: "L", stock: 7 }],
    specs: [["Fabric", "Rayon"], ["Set", "Kurta + dupatta"]], desc: "Flowy anarkali kurta with a matching printed dupatta — an easy festive look.", source: "Meesho supplier: Shree Fabrics" },
  { sku: "BOT-SAR-001", name: "Soft Georgette Printed Saree", brand: "Vastra", cat: "womens-fashion", price: 799, mrp: 2499, cost: 380, ship: 65, gst: 5, stock: 25, images: ["saree"], featured: true,
    specs: [["Fabric", "Georgette"], ["Length", "5.5 m + 0.8 m blouse piece"]], desc: "Lightweight georgette saree with an all-over floral print and unstitched blouse piece.", source: "Meesho supplier: Surat Sarees Co." },
  { sku: "BOT-DUP-001", name: "Chanderi Silk Dupatta", brand: "Vastra", cat: "womens-fashion", price: 399, mrp: 899, cost: 170, ship: 45, gst: 5, stock: 3, images: ["dupatta"],
    specs: [["Fabric", "Chanderi silk blend"], ["Length", "2.25 m"]], desc: "Elegant zari-border dupatta to pair with plain kurtas." },
  { sku: "BOT-TSH-001", name: "Men's Everyday Cotton T-shirt", brand: "Basics Co.", cat: "mens-fashion", price: 349, mrp: 799, cost: 150, ship: 45, gst: 5, stock: 0, images: ["tshirt-navy", "tshirt-olive"], featured: true,
    variants: [{ name: "M", stock: 20 }, { name: "L", stock: 25 }, { name: "XL", stock: 15 }],
    specs: [["Fabric", "180 GSM combed cotton"], ["Fit", "Regular"]], desc: "Soft, durable crew-neck tee that keeps its shape wash after wash." },
  { sku: "BOT-SHR-001", name: "Slim Fit Oxford Shirt", brand: "Basics Co.", cat: "mens-fashion", price: 749, mrp: 1799, cost: 360, ship: 55, gst: 5, stock: 18, images: ["shirt"],
    specs: [["Fabric", "Cotton oxford"], ["Fit", "Slim"]], desc: "A crisp oxford shirt that works for office and weekends." },
  { sku: "BOT-HOD-001", name: "Fleece Pullover Hoodie", brand: "Northline", cat: "mens-fashion", price: 999, mrp: 2299, cost: 520, ship: 70, gst: 12, stock: 12, images: ["hoodie"],
    specs: [["Fabric", "Brushed fleece"], ["Pockets", "Kangaroo"]], desc: "Warm brushed-fleece hoodie with a relaxed fit." },
  { sku: "BOT-MUG-001", name: "Stoneware Coffee Mug Set of 2", brand: "Clayworks", cat: "home-kitchen", price: 449, mrp: 899, cost: 190, ship: 70, gst: 12, stock: 30, images: ["mug"],
    specs: [["Capacity", "350 ml each"], ["Microwave safe", "Yes"]], desc: "Hand-glazed stoneware mugs with a comfortable handle." },
  { sku: "BOT-LMP-001", name: "Rechargeable LED Table Lamp", brand: "Glowhome", cat: "home-kitchen", price: 899, mrp: 1999, cost: 430, ship: 75, gst: 18, stock: 14, images: ["lamp"], pay: "ONLINE_ONLY",
    specs: [["Battery", "1800 mAh"], ["Modes", "3 colour temperatures"]], desc: "Touch-dimmable desk lamp with three light modes and USB-C charging." },
  { sku: "BOT-CSH-001", name: "Cotton Cushion Covers (Set of 5)", brand: "Clayworks", cat: "home-kitchen", price: 499, mrp: 1299, cost: 210, ship: 60, gst: 12, stock: 22, images: ["cushion"],
    specs: [["Size", "16 x 16 inch"], ["Closure", "Zip"]], desc: "Printed cotton cushion covers to refresh your living room." },
  { sku: "BOT-SER-001", name: "Vitamin C Face Serum 30ml", brand: "Glowlab", cat: "beauty", price: 399, mrp: 799, cost: 140, ship: 45, gst: 18, stock: 50, images: ["serum"], featured: true,
    specs: [["Skin type", "All"], ["Key ingredient", "10% Vitamin C"]], desc: "Lightweight brightening serum for a more even skin tone." },
  { sku: "BOT-LIP-001", name: "Matte Liquid Lipstick", brand: "Glowlab", cat: "beauty", price: 249, mrp: 499, cost: 90, ship: 40, gst: 18, stock: 0, images: ["lipstick"], variants: [{ name: "Ruby", stock: 15 }, { name: "Nude", stock: 18 }, { name: "Berry", stock: 2 }],
    specs: [["Finish", "Matte"], ["Wear", "Up to 12 hours"]], desc: "Transfer-resistant matte lipstick with a comfortable feel." },
  { sku: "BOT-FWS-001", name: "Neem & Tea Tree Face Wash", brand: "Herbique", cat: "beauty", price: 199, mrp: 349, cost: 70, ship: 40, gst: 18, stock: 80, images: ["facewash"],
    specs: [["Size", "100 ml"], ["Skin type", "Oily & acne-prone"]], desc: "Gentle daily cleanser with neem and tea tree." },
  { sku: "BOT-PWB-001", name: "10000mAh Fast Charging Power Bank", brand: "Voltix", cat: "electronics", price: 999, mrp: 2199, cost: 560, ship: 60, gst: 18, stock: 20, images: ["powerbank"],
    specs: [["Output", "22.5W"], ["Ports", "USB-C + USB-A"]], desc: "Slim power bank that charges your phone up to twice." },
  { sku: "BOT-WCH-001", name: "Minimal Analog Watch", brand: "Timely", cat: "jewellery", price: 799, mrp: 1999, cost: 350, ship: 50, gst: 18, stock: 9, images: ["watch"],
    specs: [["Strap", "Silicone"], ["Water resistance", "30 m"]], desc: "Clean, everyday analog watch with a comfortable silicone strap." },
  { sku: "BOT-SNK-001", name: "Lightweight Running Sneakers", brand: "Stride", cat: "footwear", price: 1199, mrp: 2999, cost: 620, ship: 90, gst: 12, stock: 0, images: ["sneakers"], featured: true,
    variants: [{ name: "UK 7", stock: 6 }, { name: "UK 8", stock: 8 }, { name: "UK 9", stock: 5 }, { name: "UK 10", stock: 0 }],
    specs: [["Upper", "Breathable mesh"], ["Sole", "EVA"]], desc: "Cushioned, breathable sneakers for daily runs and walks." },
  { sku: "BOT-SND-001", name: "Comfort Everyday Sandals", brand: "Stride", cat: "footwear", price: 599, mrp: 1299, cost: 260, ship: 80, gst: 12, stock: 16, images: ["sandals"],
    specs: [["Strap", "Adjustable"], ["Sole", "Anti-slip"]], desc: "Soft footbed sandals with adjustable straps." },
  { sku: "BOT-CAR-001", name: "Pull-back Racing Toy Car", brand: "Playhub", cat: "kids-toys", price: 299, mrp: 599, cost: 110, ship: 50, gst: 12, stock: 35, images: ["toy-car"],
    specs: [["Age", "3+ years"], ["Material", "Non-toxic ABS"]], desc: "Sturdy pull-back car — no batteries needed." },
  { sku: "BOT-BLK-001", name: "Building Blocks Set (120 pcs)", brand: "Playhub", cat: "kids-toys", price: 649, mrp: 1299, cost: 280, ship: 70, gst: 12, stock: 11, images: ["blocks"],
    specs: [["Pieces", "120"], ["Age", "4+ years"]], desc: "Colourful interlocking blocks for creative play." },
  { sku: "BOT-EAR-002", name: "Gold-plated Jhumka Earrings", brand: "Aabha", cat: "jewellery", price: 349, mrp: 999, cost: 120, ship: 45, gst: 3, stock: 28, images: ["earrings"], pay: "ONLINE_AND_COD",
    specs: [["Plating", "Gold tone"], ["Closure", "Push back"]], desc: "Traditional jhumkas with a lightweight, comfortable build.", source: "Meesho supplier: Aabha Creations" },
  { sku: "BOT-BAG-001", name: "Structured Tote Handbag", brand: "Aabha", cat: "jewellery", price: 899, mrp: 2499, cost: 420, ship: 70, gst: 12, stock: 7, images: ["bag"],
    specs: [["Material", "Vegan leather"], ["Compartments", "3"]], desc: "Roomy tote with a zip compartment — fits a 13-inch laptop." },
];

async function main() {
  console.log("Seeding…");
  await db.storeSettings.upsert({
    where: { id: "store" },
    update: {},
    create: {
      id: "store", storeName: "Buyontime", tagline: "Everything you need, delivered on time.",
      contactEmail: "support@buyontime.example", contactPhone: "+91 90000 00000", storeAddress: "Gurugram, Haryana, India",
      legalName: "Buyontime (demo)", grievanceOfficerName: "Grievance Officer", grievanceOfficerEmail: "grievance@buyontime.example",
      freeShippingThreshold: rs(499), standardShippingFee: rs(49), codFee: rs(20), codRtoRatePct: 20, packagingCostPerOrder: rs(10),
      codCollectionCharge: rs(25), vipLifetimeSpend: rs(5000),
    },
  });

  let admin: { id: string } | null = null;
  let customer: User | null = null;
  let customer2: User | null = null;
  if (!catalogOnly) {
    const [adminPw, supplierPw, customerPw] = await Promise.all([
      bcrypt.hash(password("SEED_ADMIN_PASSWORD", "Admin@12345"), 12),
      bcrypt.hash(password("SEED_SUPPLIER_PASSWORD", "Supplier@12345"), 12),
      bcrypt.hash(password("SEED_CUSTOMER_PASSWORD", "Customer@12345"), 12),
    ]);
    admin = await db.user.upsert({ where: { email: "admin@buyontime.test" }, update: {}, create: { name: "Store Admin", email: "admin@buyontime.test", phone: "9000000001", role: "ADMIN", passwordHash: adminPw } });
    await db.user.upsert({ where: { email: "supplier@buyontime.test" }, update: {}, create: { name: "Demo Supplier", email: "supplier@buyontime.test", phone: "9000000002", role: "SUPPLIER", passwordHash: supplierPw } });
    customer = await db.user.upsert({ where: { email: "customer@buyontime.test" }, update: {}, create: { name: "Harshit Sharma", email: "customer@buyontime.test", phone: "9876543210", role: "CUSTOMER", passwordHash: customerPw } });
    customer2 = await db.user.upsert({ where: { email: "priya@buyontime.test" }, update: {}, create: { name: "Priya Nair", email: "priya@buyontime.test", phone: "9812345678", role: "CUSTOMER", passwordHash: customerPw } });

    for (const u of [customer, customer2]) {
      if ((await db.address.count({ where: { userId: u.id } })) === 0) {
        await db.address.create({ data: { userId: u.id, name: u.name, phone: u.phone!, line1: u === customer ? "Flat 402, Palm Residency, Sector 45" : "12 MG Road", city: u === customer ? "Gurugram" : "Bengaluru", state: u === customer ? "Haryana" : "Karnataka", pincode: u === customer ? "122003" : "560001", isDefault: true } });
      }
    }
  }

  const catIds: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await db.category.upsert({ where: { slug: c.slug }, update: {}, create: { slug: c.slug, name: c.name, imageUrl: c.image, sortOrder: i } });
    catIds[c.slug] = row.id;
  }

  for (const p of PRODUCTS) {
    const exists = await db.product.findUnique({ where: { sku: p.sku } });
    if (exists) continue;
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const product = await db.product.create({
      data: {
        sku: p.sku, name: p.name, slug, brand: p.brand, description: p.desc, categoryId: catIds[p.cat], status: "ACTIVE",
        paymentOption: p.pay ?? "ONLINE_AND_COD", price: rs(p.price), mrp: rs(p.mrp), costPrice: rs(p.cost), shippingCost: rs(p.ship),
        otherCost: rs(5), gstRate: p.gst, isFeatured: Boolean(p.featured), sourceName: p.source ?? null,
        specs: p.specs.map(([label, value]) => ({ label, value })),
        images: { create: p.images.map((img, i) => ({ url: `/seed/${img}.svg`, storageKey: null, alt: p.name, position: i })) },
      },
    });
    const variants = p.variants ?? [{ name: "Default", stock: p.stock }];
    for (const [i, v] of variants.entries()) {
      const variant = await db.productVariant.create({
        data: { productId: product.id, name: v.name, sku: p.variants ? `${p.sku}-${v.name.replace(/\s+/g, "").toUpperCase()}` : p.sku, stock: v.stock, isDefault: i === 0, position: i },
      });
      if (v.stock > 0) await db.inventoryMovement.create({ data: { variantId: variant.id, type: "ADJUSTMENT", delta: v.stock, quantity: v.stock, actorId: admin?.id ?? null, note: "Opening stock (seed)" } });
    }
  }

  await db.coupon.upsert({ where: { code: "WELCOME10" }, update: {}, create: { code: "WELCOME10", description: "10% off your first order (up to ₹150) on orders above ₹499", type: "PERCENTAGE", value: 10, minOrder: rs(499), maxDiscount: rs(150), perUserLimit: 1 } });
  await db.coupon.upsert({ where: { code: "FLAT100" }, update: {}, create: { code: "FLAT100", description: "Flat ₹100 off on orders above ₹999", type: "FIXED", value: rs(100), minOrder: rs(999), perUserLimit: 3, usageLimit: 500 } });

  // Demo orders — Cash on Delivery only. Online orders are only ever created through the real Razorpay flow.
  if (!catalogOnly && customer && customer2 && (await db.order.count({ where: { orderNumber: { startsWith: "BOTDEMO" } } })) === 0) {
    const pick = async (sku: string) => db.productVariant.findFirstOrThrow({ where: { OR: [{ sku }, { sku: { startsWith: `${sku}-` } }] }, include: { product: { include: { images: { take: 1 } } } } });
    const demos: { n: string; user: User; sku: string; qty: number; status: "DELIVERED" | "PROCESSING" | "SHIPPED" | "CANCELLED"; daysAgo: number; collected: boolean }[] = [
      { n: "BOTDEMO0001", user: customer, sku: "BOT-SER-001", qty: 2, status: "DELIVERED", daysAgo: 12, collected: true },
      { n: "BOTDEMO0002", user: customer, sku: "BOT-BTL-001", qty: 1, status: "SHIPPED", daysAgo: 2, collected: false },
      { n: "BOTDEMO0003", user: customer2, sku: "BOT-SAR-001", qty: 1, status: "DELIVERED", daysAgo: 20, collected: true },
      { n: "BOTDEMO0004", user: customer2, sku: "BOT-MUG-001", qty: 1, status: "PROCESSING", daysAgo: 1, collected: false },
      { n: "BOTDEMO0005", user: customer, sku: "BOT-FWS-001", qty: 3, status: "CANCELLED", daysAgo: 6, collected: false },
    ];
    for (const d of demos) {
      const v = await pick(d.sku);
      const addr = await db.address.findFirstOrThrow({ where: { userId: d.user.id } });
      const created = new Date(Date.now() - d.daysAgo * 86400000);
      const subtotal = v.product.price * d.qty;
      const shippingFee = subtotal >= rs(499) ? 0 : rs(49);
      const total = subtotal + shippingFee + rs(20);
      const committed = d.status !== "CANCELLED";
      const order = await db.order.create({
        data: {
          orderNumber: d.n, userId: d.user.id, customerName: addr.name, email: d.user.email, phone: addr.phone,
          shippingAddress: { name: addr.name, phone: addr.phone, line1: addr.line1, line2: null, landmark: null, city: addr.city, state: addr.state, pincode: addr.pincode },
          pincode: addr.pincode, city: addr.city, state: addr.state, status: d.status, paymentMethod: "COD",
          paymentStatus: d.collected ? "PAID" : d.status === "CANCELLED" ? "CANCELLED" : "PENDING", stockState: committed ? "COMMITTED" : "RELEASED",
          subtotal, shippingFee, codFee: rs(20), total, gstAmount: Math.round((subtotal * v.product.gstRate) / (100 + v.product.gstRate)),
          customerNote: "Demo order (seed data)", createdAt: created, confirmedAt: created, paidAt: d.collected ? new Date(created.getTime() + 4 * 86400000) : null,
          deliveredAt: d.status === "DELIVERED" ? new Date(created.getTime() + 4 * 86400000) : null,
          cancelledAt: d.status === "CANCELLED" ? new Date(created.getTime() + 3600000) : null, cancelReason: d.status === "CANCELLED" ? "Changed my mind" : null,
          items: { create: [{ productId: v.productId, variantId: v.id, name: v.product.name, variantName: v.isDefault ? null : v.name, sku: v.sku, imageUrl: v.product.images[0]?.url ?? null, quantity: d.qty, unitPrice: v.product.price, unitMrp: v.product.mrp, unitCost: v.product.costPrice, unitShippingCost: v.product.shippingCost, unitOtherCost: v.product.otherCost, gstRate: v.product.gstRate, lineTotal: subtotal }] },
          payments: { create: [{ userId: d.user.id, method: "COD", provider: "cod", amount: total, status: d.collected ? "PAID" : d.status === "CANCELLED" ? "CANCELLED" : "PENDING", gatewayStatus: d.collected ? "cod_collected" : null, paidAt: d.collected ? new Date(created.getTime() + 4 * 86400000) : null, createdAt: created }] },
          events: { create: [
            { type: "ORDER_PLACED", message: "Order placed — Cash on Delivery.", createdAt: created },
            { type: "ORDER_CONFIRMED", message: "Order confirmed (COD). Payment to be collected on delivery.", createdAt: created },
            ...(d.status === "CANCELLED" ? [{ type: "ORDER_CANCELLED", message: "Order cancelled by customer: Changed my mind", createdAt: new Date(created.getTime() + 3600000) }] : []),
            ...(["SHIPPED", "DELIVERED"].includes(d.status) ? [{ type: "SHIPPED", message: "Shipped (Delhivery DL1234567890)", createdAt: new Date(created.getTime() + 86400000) }] : []),
            ...(d.status === "PROCESSING" ? [{ type: "PROCESSING", message: "Processing", createdAt: new Date(created.getTime() + 3600000) }] : []),
            ...(d.status === "DELIVERED" ? [{ type: "DELIVERED", message: "Delivered", createdAt: new Date(created.getTime() + 4 * 86400000) }, { type: "COD_COLLECTED", message: "Cash on Delivery amount collected.", createdAt: new Date(created.getTime() + 4 * 86400000) }] : []),
          ] },
          ...(["SHIPPED", "DELIVERED"].includes(d.status) ? { shipment: { create: { courier: "Delhivery", trackingId: `DL${d.n.slice(-4)}567890`, trackingUrl: "https://www.delhivery.com/", shippedAt: new Date(created.getTime() + 86400000), deliveredAt: d.status === "DELIVERED" ? new Date(created.getTime() + 4 * 86400000) : null } } } : {}),
        },
      });
      if (committed) {
        await db.productVariant.update({ where: { id: v.id }, data: { stock: { decrement: d.qty }, soldCount: { increment: d.qty } } });
        await db.inventoryMovement.create({ data: { variantId: v.id, type: "RESERVE", delta: -d.qty, quantity: d.qty, orderId: order.id, note: "Demo order" } });
      }
    }
    // A delivered-order review so ratings render.
    const serum = await db.product.findUniqueOrThrow({ where: { sku: "BOT-SER-001" } });
    await db.review.upsert({ where: { productId_userId: { productId: serum.id, userId: customer.id } }, update: {}, create: { productId: serum.id, userId: customer.id, rating: 5, title: "Visible glow in two weeks", body: "Light texture, absorbs quickly and doesn't sting." } });
    await db.product.update({ where: { id: serum.id }, data: { ratingAvg: 5, ratingCount: 1 } });
  }

  if (catalogOnly) console.log("Done (catalog only). Create the owner login with: npm run db:create-admin");
  else console.log("Done. Demo logins: admin@buyontime.test / supplier@buyontime.test / customer@buyontime.test (see README for passwords).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
