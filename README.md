# Buyontime

A production-ready, full-stack e-commerce platform for India, built with Next.js, PostgreSQL, Prisma and Razorpay. It includes the customer storefront, the customer account area, Razorpay and Cash on Delivery checkout with per-product payment rules, and automatic payment reconciliation. The admin and supplier portal covers orders, inventory, Customer 360°, returns and refunds, a transparent profit engine, notifications and an audit trail.

> Original design and code. Not affiliated with, and not a copy of, Amazon, Flipkart, Myntra or Meesho.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Database](#database)
5. [Getting started (local)](#getting-started-local)
6. [Environment variables](#environment-variables)
7. [Razorpay setup](#razorpay-setup)
8. [Image storage (Vercel Blob or Cloudinary)](#image-storage-vercel-blob-or-cloudinary)
9. [Email & notifications](#email--notifications)
10. [Deploying to Vercel](#deploying-to-vercel)
11. [Demo data & credentials](#demo-data--credentials)
12. [Testing](#testing)
13. [How payments work](#how-payments-work)
14. [Security](#security)
15. [Before you go live](#before-you-go-live)

---

## Features

### Customer store
- Home page with hero, categories, featured products, deals of the day (largest discounts), best sellers (by units sold), new arrivals and a trust strip.
- Personalised sections for signed-in shoppers: "Welcome back", order-status nudges, "Recommended for you" (from browsing and purchase categories) and "Recently viewed".
- Catalogue with search (name, brand, category, SKU) and filters (category, price, brand, rating, in stock, on discount), sorting and pagination.
- Product page with a swipeable gallery, variant picker, stock status, specifications, verified-buyer reviews and a sticky mobile buy bar. It also shows which payment methods the product allows, and includes JSON-LD structured data and dynamic Open Graph metadata.
- Cart backed by the database, including guest carts that merge on sign-in. Quantities are capped by stock, and it shows free-shipping progress.
- Checkout steps: contact, address, summary, payment. It supports coupons, shows only the payment methods allowed, and has a sticky mobile pay bar. Double-submit is idempotent.
- Order confirmation page shows "Payment Successful" or "Order placed successfully" with the order ID, payment ID, amount, method, summary and expected delivery.
- Mobile-first layout with a bottom navigation bar, a filter drawer and sticky cart and checkout bars.

### Customer account
Dashboard, orders, order details and tracking, payment history, returns and refunds, wishlist, notifications, addresses and profile (including communication preferences and password change).

- The order timeline shows: Order Placed → Payment Confirmed → Order Confirmed → Processing → Shipped → Out for Delivery → Delivered.
- Payment status wording is one of: Payment Successful, Payment Pending, Payment Failed — Try Again, Refund Processing or Refund Completed.
- Customers can cancel orders before shipping (prepaid cancellations are refunded automatically), retry a failed payment, request a return and contact support.

### Payments
- **Per-product payment rules**: `ONLINE_ONLY`, `COD_ONLY` or `ONLINE_AND_COD`. These are combined with store switches, per-customer COD blocking, COD pincode block-lists and COD minimum/maximum order values.
- **Mixed carts**: if the items share no common payment method, checkout shows a clear message and lets the customer place separate orders. A configurable setting can block checkout instead.
- **Razorpay**:
  - The server creates the Razorpay order, amounts are in paise and the currency is INR.
  - The Checkout signature is verified with HMAC, then the payment is re-fetched from the Razorpay API.
  - Webhooks are signature-verified and idempotent per event ID.
  - Authorised payments are captured automatically.
  - Refunds go through the Razorpay Refund API.
- **COD**: an order is created as *Confirmed* with payment *Pending*, and is never marked paid automatically. Staff mark it collected; this can optionally happen on delivery.
- **Reconciliation screen**: compares the database with Razorpay and flags `⚠ PAYMENT RECONCILIATION REQUIRED`. It never overwrites data silently: fixes need explicit confirmation and are audit-logged.
- **Unpaid online orders expire** and release their reserved stock. Before expiring an order, Razorpay is checked so that a late payment is never lost.

### Admin & supplier portal (`/admin`)
- **Dashboard**:
  - Revenue for today, the last 7 days and this month, plus estimated monthly profit and margin.
  - Order and payment status counts, COD vs online split, customers (new, returning, VIP), inventory alerts and returns.
  - A 30-day chart and a recent-activity feed, with attention and reconciliation alerts.
- **Orders**: filters for search, status, payment, method, date, product, city, state and pincode. Each order shows items, payment attempts, Razorpay IDs, refunds, courier and tracking, a profit breakdown and the full timeline. Staff can update status (following the state machine), mark RTO, mark COD collected and issue refunds.
- **Payments**: 🟢 received, 🟡 pending, 🔴 failed and 🔵 refunded, plus reconciliation.
- **Products**:
  - Create, edit, enable/disable and soft-delete.
  - Variants with their own SKU, stock and optional price override; specifications; GST rate; and costs (product/source cost, shipping, other).
  - Payment option dropdown, and a live per-unit profit calculator for online and COD sales.
  - Sourcing fields (for example a Meesho supplier), entered manually with no scraping.
  - Multi-image upload with preview, delete, replace, set-primary and drag-to-reorder.
- **Inventory**: current, reserved, available, sold, damaged/returned-to-supplier and low-stock alerts, with quick stock and price edits. Every change is recorded in an inventory ledger.
- **Customer 360°**:
  - Profile, addresses, and order stats (successful, cancelled, returned, COD vs online).
  - Payment history (paid, pending, failed, refunds), lifetime value and average order value.
  - Products and categories purchased, wishlist, current cart and recently viewed items.
  - Notes and complaints, returns and refunds, and communication history.
  - Actions to block the account or block COD for that customer.
- **Returns**: request → approve or reject → receive and inspect each unit (**resellable** goes back to stock; **damaged** or **return-to-supplier** does not) → refund through Razorpay, or record a manual refund reference for COD.
- **Coupons** (percentage or fixed, minimum order, maximum discount, expiry, total and per-customer limits), **categories** and **settings** (store, payments, shipping, returns, profit engine, notifications, and integration status with secrets never shown).
- **Notification centre** with live polling and toasts; **audit log** with old and new values.
- **Roles**: ADMIN has everything. SUPPLIER has the dashboard (operations only), products, inventory and orders, and cannot see finance, customers, coupons, settings, payments or the audit log. Permissions live in one map (`src/lib/permissions.ts`), ready to move to the database.

### Profit engine
Estimated net profit = Revenue − Refunds − GST payable (if registered) − Product cost (after input tax credit, if configured) − Shipping − RTO/return shipping − Other costs − Razorpay fee (the actual fee once Razorpay reports it) or the courier COD charge.

Every order shows each line with an explanation. Open COD orders can carry an optional RTO risk provision.

---

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions, Route Handlers) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui-style components on Radix primitives, Lucide icons, Sonner toasts, Recharts |
| Database | PostgreSQL + Prisma 6 |
| Auth | Database-backed sessions (httpOnly cookie, keyed-hash tokens), bcrypt passwords, role-based access control |
| Payments | Razorpay (REST API + Checkout.js + webhooks) |
| Images | Vercel Blob, or Cloudinary (signed direct uploads, automatic format and quality) |
| Email | Resend (via a pluggable adapter); SMS and WhatsApp via webhook adapters |
| Hosting | Vercel (with a cron job for payment expiry) |
| Tests | Node test runner (unit) + Playwright (end-to-end) |

---

## Architecture

```
src/
  app/
    (store)/            storefront + customer account (route group)
    admin/              admin login + (portal)/ protected admin pages
    api/                payments verify/failed, Razorpay webhook, uploads, cron, health
    sitemap.ts, robots.ts
  actions/              server actions (thin: auth → validate → call a service)
  server/               business services: orders, payments, refunds, returns, inventory, cart, checkout, catalog, dashboard, profit
  lib/                  pure logic & infrastructure: pricing, payment-rules, profit, order-status, razorpay client,
                        storage, notifications (events/templates/adapters/dispatch), auth, permissions, audit, validation
  components/           ui/ primitives, store/ and admin/ feature components
prisma/                 schema.prisma, migrations/, seed.ts
tests/                  unit/ (pure logic) and e2e/ (Playwright + Razorpay test double)
```

- **Business logic lives in `src/server` and `src/lib`**; pages and actions stay thin.
- **The rules are pure functions** (`payment-rules`, `pricing`, `profit`, `order-status`). The UI and the server use the same functions, so the server never accepts a price or payment method the UI would not show.
- **All money is stored as integer paise.**

---

## Database

The Prisma schema (`prisma/schema.prisma`) has these models:

| Group | Models |
|---|---|
| Identity & auth | `User` (role: `ADMIN`, `SUPPLIER` or `CUSTOMER`), `Session`, `PasswordResetToken`, `Address` |
| Catalogue | `Category`, `Product`, `ProductImage`, `ProductVariant` (the inventory record: available stock and sold count), `InventoryMovement` (ledger), `Review`, `WishlistItem`, `ProductView` |
| Cart | `Cart`, `CartItem` |
| Orders | `Order` (address snapshot, totals, status, payment status, stock state, idempotency key), `OrderItem` (price and cost snapshots), `OrderEvent` (timeline), `ShippingInformation` |
| Payments | `Payment` (one per attempt; Razorpay order and payment IDs; gateway fee; reconciliation), `Refund`, `WebhookEvent` (unique event ID for idempotency) |
| Returns | `ReturnRequest`, `ReturnItem` (with the inspected condition) |
| Promotions | `Coupon`, `CouponUsage` |
| Notifications & admin | `Notification` (in-app, unique dedupe key), `NotificationDelivery` (email/SMS/WhatsApp log, unique dedupe key), `CustomerNote`, `AuditLog`, `RateLimit`, `StoreSettings` |

Every foreign key and common filter is indexed, for example order status and date, payment status, pincode and phone.

---

## Getting started (local)

Requirements: **Node.js 20.9+** and **PostgreSQL 14+**.

```bash
git clone https://github.com/agentravan/Buyontime.git
cd Buyontime
cp .env.example .env            # then fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET (and Razorpay test keys)
npm install                     # also runs `prisma generate`
npx prisma migrate deploy       # create tables
npm run db:seed                 # demo data (see credentials below)
npm run dev                     # http://localhost:3000
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | Full end-to-end suite (see [Testing](#testing)) |
| `npm run db:migrate` | Create a new migration after editing the schema (development) |
| `npm run db:deploy` | Apply migrations (production) |

---

## Environment variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Pooled Postgres URL in production |
| `DIRECT_URL` | ✅ | Direct (non-pooled) URL, used by migrations |
| `AUTH_SECRET` | ✅ | Random string of 32+ characters (session token hashing) |
| `APP_URL` | recommended | Public URL, e.g. `https://buyontime.in` (emails, sitemap, OG). Falls back to the Vercel production URL |
| `RAZORPAY_KEY_ID` | ✅ for online payments | `rzp_test_…` or `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | ✅ for online payments | **Server only** |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | ✅ for online payments | Same value as `RAZORPAY_KEY_ID` (the public key) |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ for automatic status updates | The secret you enter when creating the webhook |
| `BLOB_READ_WRITE_TOKEN` **or** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | ✅ one of them, for image uploads in production | The Blob token is added automatically when you connect a Blob store to the Vercel project. `CLOUDINARY_FOLDER` is optional |
| `SITE_NOTICE` | optional | Text for a notice bar across the store, e.g. “Test store — orders are not real”. Remove it to hide the bar |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | Order and payment emails and password-reset emails |
| `SMS_WEBHOOK_URL` / `WHATSAPP_WEBHOOK_URL` (+ `_TOKEN`) | optional | Your SMS or WhatsApp provider endpoint |
| `CRON_SECRET` | recommended | Protects `/api/cron/expire-orders` (Vercel Cron sends it automatically) |
| `RATE_LIMIT_REGISTER_PER_HOUR`, `RATE_LIMIT_LOGIN_PER_IP`, `RATE_LIMIT_LOGIN_PER_ACCOUNT` | optional | Abuse limits (defaults 30/hour, 60 and 8 per 15 min). Raise only for automated test runs |
| `SEED_ADMIN_PASSWORD`, `SEED_SUPPLIER_PASSWORD`, `SEED_CUSTOMER_PASSWORD` | when seeding production | Development falls back to the demo passwords |

`RAZORPAY_KEY_SECRET` is only read in `src/lib/razorpay.ts` and `src/lib/env.ts`, which are server-only modules. It is never sent to the browser. Only `NEXT_PUBLIC_RAZORPAY_KEY_ID` is public.

---

## Razorpay setup

1. Create an account at <https://dashboard.razorpay.com>. Test mode works immediately. Live mode needs KYC and activation, and Razorpay reviews your website's policy pages. This project ships `/policies/terms`, `/policies/privacy`, `/policies/returns`, `/policies/shipping`, `/policies/contact` and `/policies/grievance`, filled in from **Admin → Settings**.
2. Go to **Settings → API Keys** and generate a key. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` (the same value as the key ID).
3. Go to **Settings → Webhooks → Add new webhook**:
   - **URL**: `https://<your-domain>/api/webhooks/razorpay`
   - **Secret**: any strong random string. Put the same value in `RAZORPAY_WEBHOOK_SECRET`.
   - **Events**: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `refund.failed`
4. Optional: under **Settings → Payment capture**, enable automatic capture. If authorised payments are not captured automatically, the app captures them itself.
5. Test with Razorpay's [test cards and UPI IDs](https://razorpay.com/docs/payments/payments/test-card-upi-details/). Check **Admin → Payments**: status should update without you opening Razorpay.
6. When you go live, switch all three keys to `rzp_live_…`, create a **new** webhook in live mode (webhooks are per mode), then redeploy.

---

## Image storage (Vercel Blob or Cloudinary)

The app picks a driver automatically: **Cloudinary** if its three variables are set, otherwise **Vercel Blob** if `BLOB_READ_WRITE_TOKEN` is set, otherwise the local-disk driver (development only).

**Vercel Blob (simplest).** In the Vercel project, open **Storage → Create → Blob** and connect it to the project; Vercel adds `BLOB_READ_WRITE_TOKEN` for you. Uploads go through `/api/admin/uploads/blob`. Vercel limits function request bodies to 4.5 MB, so the admin uploader re-encodes larger photos to WebP (longest side ≤ 2400 px) in the browser before sending them.

**Cloudinary.** Create a free account at <https://cloudinary.com> and copy the cloud name, API key and API secret into the environment variables. Uploads go **directly from the browser to Cloudinary** with a short-lived signature from `/api/admin/uploads/sign`, so large images never pass through Vercel functions. Images are delivered with `f_auto,q_auto` and a width limit.

The local-disk fallback writes to `public/uploads` and **is disabled in production**, because Vercel's filesystem is not persistent.

---

## Email & notifications

- Events: `ORDER_CREATED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `ORDER_CONFIRMED`, `ORDER_PROCESSING`, `ORDER_SHIPPED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, `RETURN_REQUESTED`, `REFUND_INITIATED` and `REFUND_COMPLETED`, plus welcome and password-reset emails and admin events (new order, COD order, payment received or failed, low stock, return, refund, complaint, action required).
- Every event writes an **in-app notification**, and an **email / SMS / WhatsApp delivery** when that channel is configured and enabled. Each notification has a unique dedupe key, so a replayed webhook can never notify twice.
- **Adapters** live in `src/lib/notifications/adapters.ts`. Email uses Resend: set `RESEND_API_KEY` and `EMAIL_FROM`, and verify your domain in Resend. SMS and WhatsApp use generic webhook adapters, so you can plug in MSG91, Gupshup, Twilio and similar providers without changing business logic.
- If a channel isn't configured, its delivery is logged as `SKIPPED` rather than faked. You can see this in Customer 360° → Communication.
- Razorpay sends its own payment receipts only if you enable that in the Razorpay dashboard. The app does not assume it does.

---

## Deploying to Vercel

1. **Create a production PostgreSQL database.** Neon or Supabase both work well with Vercel; they are available from the Vercel Marketplace. Copy the **pooled** connection string into `DATABASE_URL` (for PgBouncer add `?pgbouncer=true&connection_limit=1`) and the **direct** string into `DIRECT_URL`.
2. In Vercel, go to **Add New → Project → Import Git Repository** and choose `agentravan/Buyontime`. The framework is detected as Next.js, and `vercel.json` sets the build command to `npm run vercel-build` (`prisma generate && prisma migrate deploy && next build`), so migrations run on every deploy.
3. Add the environment variables from the table above under **Settings → Environment Variables**, for Production and, if you use them, Preview.
4. Deploy. Then, **once**, from your machine and against the production database, create your admin login and (optionally) the sample catalogue. Neither command adds demo customers or orders:
   ```bash
   DATABASE_URL="<production url>" ADMIN_EMAIL="you@example.com" ADMIN_NAME="Your Name" npm run db:create-admin   # prints a generated password once
   DATABASE_URL="<production url>" npm run db:seed:catalog    # optional: settings, 8 categories, 24 sample products, coupons
   ```
   Re-running `db:create-admin` with the same email resets that password. Use the full `npm run db:seed` (demo accounts and demo orders) only for development or a throwaway demo database.
5. Add your domain under **Settings → Domains**, and set `APP_URL` to it.
6. Configure the Razorpay webhook with the production URL (see above).
7. **Cron**: `vercel.json` schedules `/api/cron/expire-orders` daily; Vercel's Hobby plan allows one daily cron. Expiry also runs whenever an admin opens the dashboard, and a late payment is always confirmed from Razorpay before an order is expired.

---

## Demo data & credentials

`npm run db:seed` creates 8 categories, 24 products (with variants, costs and GST), coupons (`WELCOME10`, `FLAT100`), store settings and five demo **Cash on Delivery** orders. No online payments are faked: online orders only come from the real Razorpay flow.

| Role | Email | Password (development default) |
|---|---|---|
| Admin | `admin@buyontime.test` | `Admin@12345` |
| Supplier | `supplier@buyontime.test` | `Supplier@12345` |
| Customer | `customer@buyontime.test` | `Customer@12345` |

Admin login: `/admin/login`. Customer login: `/login`.

**Payment-method test products:**

| | Product | Payment option |
|---|---|---|
| Product A | Aurora Pro Wireless Earbuds with ENC | `ONLINE_ONLY` |
| Product B | Hand-block Printed Cotton Kurta | `COD_ONLY` |
| Product C | Insulated Steel Water Bottle 1L | `ONLINE_AND_COD` |

These demo credentials are for development only. In production, the seed script refuses to run without the `SEED_*_PASSWORD` variables.

---

## Testing

### Unit tests
```bash
npm test
```
These cover payment-method rules (A/B/C, mixed carts, store, customer, pincode and value restrictions), pricing, coupons and paise conversion, the profit engine, Razorpay checkout and webhook signature verification, the order state machine and the timeline.

### End-to-end tests
```bash
E2E_DATABASE_URL="postgresql://…/buyontime_e2e" npm run test:e2e   # ⚠ wipes that database
# first time only: npx playwright install --with-deps chromium
```
The script builds the app in production mode, seeds a throwaway database, and starts `next start` together with a **Razorpay test double** (`tests/e2e/razorpay-double.ts`). It then runs the Playwright suite (`tests/e2e/store.spec.ts`).

The test double implements the Razorpay REST endpoints the app uses and signs checkout responses and webhooks with HMAC-SHA256, exactly like Razorpay. The application code under test is unchanged: the only difference is `RAZORPAY_API_BASE`, which must **never** be set in production. For a live check against real Razorpay, use your test keys and the manual checklist below.

The suite covers:
- Registration, login and logout.
- Search, filters and the product page.
- Payment-method visibility for products A, B and C, and the mixed-cart split.
- COD end-to-end, including inventory, notifications and admin fulfilment through to COD collection.
- Online payments:
  - Signature verification and the PAID, CONFIRMED and stock-committed states.
  - Duplicate and replayed webhooks, invalid signatures, and failure and retry.
  - Webhook-only confirmation.
  - Reconciliation mismatch and resolution.
  - Refunds, prepaid cancellation with automatic refund, and payment expiry.
- An overselling race, returns with stock classification, and coupons.
- Admin product CRUD with image upload and a price-change audit.
- The dashboard and Customer 360°.
- Role-based access (customer and supplier), CSRF and origin checks, and forged signatures.
- Responsive layouts at 390, 820 and 1440 px, with a no-horizontal-overflow check and screenshots.

### Manual go-live checklist (with real Razorpay test keys)
- [ ] Place a test order with a Razorpay test card: it shows "Payment Successful", and Admin → Payments shows 🟢.
- [ ] Use the test "failure" card: the order shows "Payment Failed — Try Again", and retrying works.
- [ ] In Razorpay Dashboard → Webhooks, the deliveries show **200** responses.
- [ ] Refund from Admin → order → Refund, and check the status becomes Refunded after the webhook.
- [ ] Admin → Payments → Check: the order shows "Matches Razorpay".
- [ ] Upload a product image (Cloudinary), and check an email arrives (Resend).

---

## How payments work

```
Customer → Checkout → server validates cart, prices, coupon, allowed method
        → Order (PENDING_PAYMENT) + stock reserved + Razorpay order created (amount in paise)
        → Razorpay Checkout (browser)
        → /api/payments/razorpay/verify: HMAC signature check + payment re-fetched from Razorpay API
        → /api/webhooks/razorpay: signature check + unique event id (idempotent)
        → applyGatewayPayment(): row locks, never downgrades PAID, commits stock once
        → Payment PAID → Order CONFIRMED → cart cleared → customer + admin notified → dashboard updated
```

- Verify, webhooks, reconciliation and expiry all go through the **same state machine** (`src/server/payments.ts`), inside a database transaction with `SELECT … FOR UPDATE`.
- **Idempotency** is enforced at several layers:
  - A unique `WebhookEvent.eventId`, and unique `razorpayOrderId` and `razorpayPaymentId`.
  - The order's `stockState` guard.
  - Unique notification dedupe keys.
  - A unique `checkoutKey` per checkout submission.
- **Inventory**: stock is decremented with a conditional `UPDATE … WHERE stock >= qty`, so two shoppers can never buy the last unit twice. COD orders commit stock immediately. Online orders reserve stock at checkout by default (configurable) and release it on failure, expiry or cancellation. If a payment is captured for stock that is no longer available, the order is flagged and refunded automatically.
- **COD**: the payment stays `PENDING` until staff mark it collected.

---

## Security

- Passwords are hashed with bcrypt (cost 12). Sessions are random 256-bit tokens; only an HMAC of the token is stored. Cookies are `httpOnly`, `SameSite=Lax` and `Secure` in production.
- Role-based access control is enforced **server-side** on every admin page, server action and API route (`requirePermission`). Middleware only redirects early.
- Server-side validation (Zod) runs on every input, and errors are mapped to safe messages, so internal errors and secrets never reach the browser.
- CSRF protection: Server Actions have Next.js's built-in origin check, and JSON routes check `Origin`. The webhook uses signature verification instead.
- Rate limiting (Postgres-backed, so it works across serverless instances) applies to login, registration, password reset, checkout, payment verification, reviews and uploads.
- Webhook and checkout signatures are compared with HMAC-SHA256 and a timing-safe comparison. Card data is never stored.
- Security headers are set (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
- The audit log records price, stock, order-status, refund, reconciliation, customer and settings changes, with old and new values.

---

## Before you go live

- [ ] GST registration and your GSTIN in Settings. Selling goods across state lines online generally requires registration — check with your CA.
- [ ] Legal name, address, contact details and grievance officer in Settings. These are required by the Consumer Protection (E-Commerce) Rules, 2020 and shown on the policy pages. Have the policy text reviewed.
- [ ] Razorpay live activation (KYC plus policy pages), live keys and a live-mode webhook.
- [ ] Cloudinary and Resend configured; a verified sending domain.
- [ ] Strong seed passwords; demo accounts replaced; demo products and orders removed.
- [ ] Only list products and images you are authorised to sell and use (for example from your supplier). This app never scrapes other sites.
