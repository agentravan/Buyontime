/**
 * "Fill from a link / pasted text" for the product editor.
 *
 * Pure functions (no network, no server imports) so they can be unit-tested:
 *  - extractFromHtml(): reads a product page's structured data (JSON-LD, Open Graph, meta tags) plus the
 *    common spec tables / feature lists that marketplaces render.
 *  - parsePastedText(): reads text copied from a marketplace app's "Share" (e.g. Meesho: "Fabric: Rayon",
 *    "Sizes: S, M, L") or any "Label: value" list.
 *  - composeListing(): turns what was found into a clean, SEO-friendly draft in the store's own voice.
 * Photos and prices are deliberately NOT imported — the owner sets those.
 */

export type ImportedSpec = { label: string; value: string };
export type Extracted = {
  title: string;
  brand: string;
  description: string;
  bullets: string[];
  specs: ImportedSpec[];
  sizes: string[];
};
export type ImportedListing = {
  name: string;
  brand: string;
  description: string;
  specs: ImportedSpec[];
  sizes: string[];
  sourceName: string;
  sourceReference: string;
  found: { bullets: number; specs: number; sizes: number };
};

const EMPTY: Extracted = { title: "", brand: "", description: "", bullets: [], specs: [], sizes: [] };

/* ───────────────────────────── text helpers ───────────────────────────── */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", trade: "™", reg: "®", copy: "©", deg: "°", times: "×", rupee: "₹" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}
function safeChar(code: number) {
  try { return String.fromCodePoint(code); } catch { return ""; }
}

/** HTML fragment → single-line plain text. */
export function toText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[​-‏‪-‮﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (end > max * 0.6) return cut.slice(0, end + 1).trim();
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trim() + "…";
}

function titleCase(label: string): string {
  const t = label.trim().replace(/\s+/g, " ").replace(/[:：\-–]+$/, "").trim();
  if (!t) return t;
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t; // already mixed case — keep
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const MARKETPLACES = /\b(amazon(\.in|\.com)?|flipkart(\.com)?|meesho|myntra|ajio|nykaa|snapdeal|shopsy|jiomart|tata ?cliq|limeroad)\b/i;

/** Removes marketplace suffixes like " Price in India - Buy … : Flipkart.com" or " : Amazon.in: Electronics". */
export function cleanTitle(raw: string): string {
  let t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  t = t.replace(/\s+Price in India\b.*$/i, "");
  t = t.replace(/\s*[:|–—-]\s*(Buy\b.*|Online Shopping\b.*)$/i, "");
  t = t.replace(/^(Buy|Shop)\s+/i, "");
  t = t.replace(/\s+Online\s+(at|in|on)\s+.*$/i, "");
  // Trailing " : Amazon.in : Electronics", " | Meesho", " - Myntra"
  for (let i = 0; i < 3; i++) {
    const m = t.match(/^(.*\S)\s*[:|–—-]\s*([^:|–—-]{0,40})$/);
    if (m && (MARKETPLACES.test(m[2]) || /^(electronics|clothing|fashion|home|kitchen|beauty|shoes|toys|jewellery|computers?|books)(\s.*)?$/i.test(m[2].trim()))) t = m[1];
    else break;
  }
  return clip(t.replace(/[\s:|,–—-]+$/, "").trim(), 150);
}

const BOILERPLATE = /\b(buy|shop|order)\b[^.]*\bonline\b|\brs\.?\s?\d|₹\s?\d|\bprice\b|genuine products?|free (shipping|delivery)|cash on delivery|\bcod\b|replacement guarantee|days? (easy )?(return|replacement)|\bemi\b|best deals?|lowest price|great offers?|\boffers?\b|\bcoupon|\bdiscount/i;

/** Keeps only sentences that describe the product (drops "Buy X online at best price…" boilerplate). */
export function productSentences(text: string): string[] {
  return decodeEntities(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && !BOILERPLATE.test(s) && !MARKETPLACES.test(s));
}

function cleanBullet(raw: string): string {
  let b = toText(raw)
    .replace(/^[\s•●▪►✔✓☑★✅➤*·–—-]+/, "")
    .replace(/[【\[]\s*([^】\]]{1,60})\s*[】\]]\s*[:：-]?\s*/g, "$1: ") // 【FAST CHARGING】text → FAST CHARGING: text
    .trim();
  const m = b.match(/^([A-Z0-9][A-Z0-9 &/+-]{2,40}):\s*(.+)$/);
  if (m) b = `${titleCase(m[1])}: ${m[2]}`;
  return clip(b, 300);
}

const SKIP_SPEC = /customer review|best ?sellers? rank|\basin\b|date first available|item model number|manufacturer|packer|importer|marketed by|\bseller\b|sold by|\bprice\b|\bmrp\b|\brating|question|warranty summary|service type|in the box contents?$|^fssai|generic name$/i;

function addSpec(out: ImportedSpec[], label: string, value: string) {
  const l = titleCase(toText(label)).slice(0, 60);
  const v = toText(value).replace(/^[:：\s]+/, "").slice(0, 200).trim();
  if (!l || !v || l.length < 2 || SKIP_SPEC.test(l) || v.length > 200) return;
  if (/^(yes|no)$/i.test(l)) return;
  if (out.some((s) => s.label.toLowerCase() === l.toLowerCase())) return;
  out.push({ label: l, value: v });
}

/* ───────────────────────────── HTML extraction ───────────────────────────── */

type Json = Record<string, unknown>;

function jsonLdProducts(html: string): Json[] {
  const found: Json[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const o = node as Json;
    const type = o["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && /^(Product|ProductGroup|IndividualProduct)$/i.test(t))) found.push(o);
    if (o["@graph"]) walk(o["@graph"]);
    if (o.mainEntity) walk(o.mainEntity);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* malformed JSON-LD — ignore */ }
  }
  return found;
}

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : "";
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "name" in (v as Json)) return str((v as Json).name);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  return "";
}

/** Text of the list items that follow a heading such as "Highlights" / "About this item" / "Key Features". */
function listAfterHeading(html: string, heading: RegExp, limit = 12): string[] {
  const m = heading.exec(html);
  if (!m) return [];
  let chunk = html.slice(m.index, m.index + 12000);
  // Only the first list after the heading — not the spec table or other lists further down.
  const end = chunk.search(/<\/(ul|ol)>/i);
  if (end > 0) chunk = chunk.slice(0, end);
  const items: string[] = [];
  for (const li of chunk.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = cleanBullet(li[1]);
    if (t.length >= 8 && !BOILERPLATE.test(t)) items.push(t);
    if (items.length >= limit) break;
  }
  return items;
}

export function extractFromHtml(html: string): Extracted {
  const out: Extracted = { ...EMPTY, bullets: [], specs: [], sizes: [] };
  const products = jsonLdProducts(html);
  const p = products[0];
  if (p) {
    out.title = str(p.name);
    out.brand = str(p.brand);
    out.description = str(p.description);
    const props = p.additionalProperty;
    if (Array.isArray(props)) for (const ap of props as Json[]) addSpec(out.specs, str(ap.name), str(ap.value));
    for (const k of ["color", "material", "pattern", "size", "model", "gtin13"] as const) {
      if (p[k] && typeof p[k] !== "object") addSpec(out.specs, k === "gtin13" ? "EAN" : k, str(p[k]));
    }
  }

  // Amazon-style
  const amazonTitle = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if (amazonTitle && !out.title) out.title = toText(amazonTitle);
  const byline = html.match(/id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i)?.[1];
  if (byline && !out.brand) out.brand = toText(byline).replace(/^(visit the|brand:)\s*/i, "").replace(/\s*store$/i, "");
  const fb = html.search(/id=["']feature-bullets["']/i);
  if (fb >= 0) {
    const chunk = html.slice(fb, fb + 20000);
    for (const m of chunk.matchAll(/<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)) {
      const t = cleanBullet(m[1]);
      if (t.length >= 8 && !BOILERPLATE.test(t)) out.bullets.push(t);
      if (out.bullets.length >= 8) break;
    }
  }
  // Amazon "detail bullets": <span class="a-text-bold">Label :</span> <span>Value</span>
  for (const m of html.matchAll(/<span[^>]*class=["'][^"']*a-text-bold[^"']*["'][^>]*>([\s\S]{1,120}?)<\/span>\s*<span[^>]*>([\s\S]{1,400}?)<\/span>/gi)) {
    const label = toText(m[1]).replace(/[:\s‏‎]+$/, "");
    if (label && label.length <= 60) addSpec(out.specs, label, m[2]);
  }

  // Spec tables on most shops (Amazon tech specs, Flipkart "Specifications", Shopify tables): 2-cell rows.
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1]);
    if (cells.length === 2) addSpec(out.specs, cells[0], cells[1]);
    if (out.specs.length >= 40) break;
  }

  // Highlights / key features lists (Flipkart, D2C shops)
  if (out.bullets.length === 0) {
    out.bullets = listAfterHeading(html, />\s*(Highlights|Key Features|Product Highlights|Features|About this item)\s*</i, 8);
  }

  // Fallbacks: Open Graph and plain meta tags
  if (!out.title) out.title = meta(html, "og:title") || meta(html, "twitter:title") || toText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || toText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!out.description) out.description = meta(html, "og:description") || meta(html, "description") || meta(html, "Description");
  if (!out.brand) out.brand = meta(html, "product:brand") || meta(html, "og:brand");

  out.title = cleanTitle(out.title);
  out.brand = toText(out.brand).slice(0, 80);
  out.description = toText(out.description);
  out.specs = out.specs.slice(0, 20);
  const sizeSpec = out.specs.find((s) => /^(size|sizes|available sizes)$/i.test(s.label));
  if (sizeSpec) out.sizes = splitSizes(sizeSpec.value);
  return out;
}

/* ───────────────────────────── pasted text ───────────────────────────── */

const NAME_KEYS = /^(name|title|product name|product|catalog name|catalogue name|item name)$/i;
const DESC_KEYS = /^(description|details|product details|about|about this item|features)$/i;
const SKIP_KEYS = /^(price|mrp|rs|offer|discount|dispatch|delivery|shipping|cod|cash on delivery|return|returns|rating|ratings|reviews?|seller|supplier|sold by|link|url|margin|resell price)\b/i;
const SIZE_TOKEN = /^(free ?size|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|\d{1,2}(\.\d)?\s?(yrs?|years?|months?|m)?|\d{2,3}(cm)?|uk ?\d{1,2}|onesize|one size|standard)$/i;

export function splitSizes(value: string): string[] {
  const parts = value
    .replace(/\([^)]*\)/g, " ")
    .split(/[,/|;\n]+|\s{2,}/)
    .map((s) => s.replace(/\(.*?\)/g, "").replace(/^size[:\s]*/i, "").trim())
    .filter(Boolean);
  const sizes = parts.filter((p) => SIZE_TOKEN.test(p)).map((p) => (/^free ?size$/i.test(p) ? "Free Size" : p.length <= 4 ? p.toUpperCase() : p));
  return [...new Set(sizes)].slice(0, 12);
}

export function parsePastedText(text: string): Extracted {
  const out: Extracted = { ...EMPTY, bullets: [], specs: [], sizes: [] };
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^[\s•●▪►✔✓☑★✅➤·-]+/, "").replace(/[*_~]+/g, "").trim())
    .filter(Boolean);
  let inSizes = false;
  let inDesc = false;
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) continue;
    // Size lines under "Sizes:" — e.g. "S (Bust Size: 36 in, Size Length: 44 in)" — before key:value parsing.
    if (inSizes) {
      const s = splitSizes(line.replace(/\s*\(.*$/, ""));
      if (s.length) { out.sizes.push(...s); continue; }
      inSizes = false;
    }
    const kv = line.match(/^([A-Za-z][A-Za-z0-9 &/().'-]{1,40}?)\s*[:：]\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      const value = kv[2].trim();
      inSizes = /^(sizes?|available sizes)$/i.test(key);
      inDesc = DESC_KEYS.test(key);
      if (NAME_KEYS.test(key) && value) { if (!out.title) out.title = value; continue; }
      if (inDesc) { if (value) out.bullets.push(cleanBullet(value)); continue; }
      if (inSizes) { if (value) out.sizes.push(...splitSizes(value)); continue; }
      if (SKIP_KEYS.test(key)) continue;
      if (/^brand$/i.test(key)) { out.brand = value; continue; }
      if (value) addSpec(out.specs, key, value);
      continue;
    }
    if (!out.title && line.length >= 3 && line.length <= 150 && !inDesc) { out.title = line; continue; }
    if (line.length >= 12 && !BOILERPLATE.test(line)) out.bullets.push(cleanBullet(line));
  }
  out.title = cleanTitle(out.title);
  out.sizes = [...new Set(out.sizes)].slice(0, 12);
  out.bullets = out.bullets.slice(0, 8);
  out.specs = out.specs.slice(0, 20);
  return out;
}

/* ───────────────────────────── listing composer ───────────────────────────── */

export function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".").slice(-2, -1)[0] ?? host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "";
  }
}

/**
 * Writes a draft description that reads well and ranks: the first sentence names the product and its
 * main benefit (search engines show ~155 characters), then scannable feature bullets, then the store's
 * promise. Built from the facts found — marketplace sales copy ("Buy … at best price") is dropped.
 */
export function composeListing(ex: Extracted, opts: { storeName: string; url?: string }): ImportedListing {
  const name = ex.title || "";
  const sentences = productSentences(ex.description);
  const bullets = [...ex.bullets];
  if (bullets.length < 3) for (const s of sentences) if (bullets.length < 5 && !bullets.includes(s)) bullets.push(clip(s, 300));
  const specLine = (label: RegExp) => ex.specs.find((s) => label.test(s.label))?.value;
  const material = specLine(/^(fabric|material|material type|outer material)$/i);
  const colour = specLine(/^(colou?r)$/i);

  const leadSource = bullets[0] ?? sentences[0] ?? "";
  let lead = leadSource.replace(/^[^:]{2,40}:\s*/, "").replace(/[.;!]+$/, "");
  lead = lead ? clip(lead.charAt(0).toLowerCase() + lead.slice(1), 140) : "";
  const extras = [material && `${material}`, colour && `in ${colour}`].filter(Boolean).join(" ");
  const intro = name
    ? `${name}${lead ? ` — ${lead}.` : extras ? ` — ${extras}.` : "."}`
    : lead ? `${lead.charAt(0).toUpperCase()}${lead.slice(1)}.` : "";

  const parts: string[] = [];
  if (intro) parts.push(intro);
  const featureList = bullets.slice(lead && bullets[0] === leadSource ? 1 : 0, 7).filter((b) => b.length >= 8);
  if (featureList.length) parts.push(["Key features", ...featureList.map((b) => `• ${b.replace(/\s*[.;]$/, "")}`)].join("\n"));
  const topSpecs = ex.specs.filter((s) => !/^(size|sizes)$/i.test(s.label)).slice(0, 6);
  if (topSpecs.length) parts.push(["At a glance", ...topSpecs.map((s) => `• ${s.label}: ${s.value}`)].join("\n"));
  parts.push(`Why shop at ${opts.storeName}\n• Quality-checked before dispatch\n• Secure online payment, or Cash on Delivery where available\n• Easy returns and quick support`);

  return {
    name: clip(name, 150),
    brand: ex.brand && !MARKETPLACES.test(ex.brand) ? ex.brand : "",
    description: parts.join("\n\n").slice(0, 5000),
    specs: ex.specs.slice(0, 20),
    sizes: ex.sizes,
    sourceName: opts.url ? siteName(opts.url) : "",
    sourceReference: opts.url ? opts.url.slice(0, 300) : "",
    found: { bullets: featureList.length, specs: ex.specs.length, sizes: ex.sizes.length },
  };
}

/** Suggests a SKU like "KUR-RAY-417" from the product name when the owner hasn't set one. */
export function suggestSku(name: string, rand: () => number = Math.random): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^(THE|AND|FOR|WITH|PACK|SET|NEW)$/.test(w));
  const head = words.slice(0, 2).map((w) => w.slice(0, 3)).join("-") || "BOT";
  return `${head}-${String(Math.floor(rand() * 900) + 100)}`;
}
