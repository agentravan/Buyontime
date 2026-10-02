import { z } from "zod";

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?91/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit Indian mobile number");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use at least one letter and one number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

export const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(80),
  phone,
  line1: z.string().trim().min(3, "Enter house / flat and street").max(160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter city").max(80),
  district: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().min(2, "Choose a state").max(80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  isDefault: z.boolean().optional(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  dateOfBirth: z.string().optional().or(z.literal("")),
  gender: z.enum(["", "female", "male", "other", "prefer_not"]).optional(),
  emailOptIn: z.boolean(),
  smsOptIn: z.boolean(),
  whatsappOptIn: z.boolean(),
});

/** Rupee input from forms → integer paise. */
export const rupees = z.coerce
  .number({ message: "Enter an amount" })
  .min(0, "Amount cannot be negative")
  .max(10_000_000, "Amount is too large")
  .transform((v) => Math.round(v * 100));

export const specSchema = z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) })).max(40);

export const variantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, "SKU may contain letters, numbers, . _ -"),
  price: rupees.nullable().optional(),
  mrp: rupees.nullable().optional(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(3, "Name is too short").max(160),
    slug: z.string().trim().max(90).optional().or(z.literal("")),
    sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, "SKU may contain letters, numbers, . _ -"),
    brand: z.string().trim().max(80).optional().or(z.literal("")),
    categoryId: z.string().optional().or(z.literal("")),
    description: z.string().trim().min(10, "Add a description (10+ characters)").max(10000),
    status: z.enum(["DRAFT", "ACTIVE", "DISABLED"]),
    paymentOption: z.enum(["ONLINE_ONLY", "COD_ONLY", "ONLINE_AND_COD"]),
    price: rupees.refine((v) => v >= 100, "Selling price must be at least ₹1"),
    mrp: rupees,
    costPrice: rupees,
    shippingCost: rupees,
    otherCost: rupees,
    gstRate: z.coerce.number().int().refine((v) => [0, 3, 5, 12, 18, 28].includes(v), "Choose a valid GST rate"),
    lowStockThreshold: z.coerce.number().int().min(0).max(100000),
    isFeatured: z.boolean(),
    sourceName: z.string().trim().max(120).optional().or(z.literal("")),
    sourceReference: z.string().trim().max(300).optional().or(z.literal("")),
    specs: specSchema,
    variants: z.array(variantInputSchema).min(1, "Add at least one variant").max(50),
  })
  .refine((p) => p.mrp >= p.price, { message: "MRP cannot be lower than the selling price", path: ["mrp"] });

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "3–20 characters: letters, numbers, - or _"),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.coerce.number().positive("Enter a discount value"),
  minOrder: rupees,
  maxDiscount: rupees.nullable(),
  expiresAt: z.string().optional().or(z.literal("")),
  usageLimit: z.coerce.number().int().positive().nullable(),
  perUserLimit: z.coerce.number().int().min(0).max(1000),
  isActive: z.boolean(),
}).refine((c) => c.type !== "PERCENTAGE" || (c.value >= 1 && c.value <= 90), { message: "Percentage must be between 1 and 90", path: ["value"] });

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(70).optional().or(z.literal("")),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});
