import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { AppError } from "@/lib/errors";
import { isPrivateIp } from "@/lib/net";
import { composeListing, extractFromHtml, siteName, type ImportedListing } from "@/lib/product-import";

/**
 * Fetches ONE product page the admin pasted, to pre-fill the editor. Guard-railed because the server is
 * making a request on the user's behalf (SSRF): http(s) only, standard ports, public IPs only (re-checked
 * on every redirect), 10 s timeout, 3 MB cap, HTML only. No images or prices are taken.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** Sites known to refuse server-side requests — we explain the paste alternative instead of a vague error. */
const BLOCKING_SITES = /(^|\.)(meesho\.com|myntra\.com|ajio\.com|bewakoof\.com)$/i;

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new AppError("That doesn't look like a web link. Paste the full product link (starting with https://)."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AppError("Only http(s) product links can be read.");
  if (url.port && url.port !== "443" && url.port !== "80") throw new AppError("This link can't be read.");
  if (url.username || url.password) throw new AppError("This link can't be read.");
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new AppError("This link can't be read.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new AppError("That website could not be found. Check the link.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new AppError("This link can't be read.");
  return url;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export async function fetchProductPage(raw: string): Promise<{ html: string; finalUrl: string }> {
  let url = await assertPublicUrl(raw);
  const blockedMsg = (site: string) =>
    new AppError(`${site} doesn't allow other websites to read its product pages. Open the product in the ${site} app or website, copy the product details (the Share → Copy text works well), and use "Paste product details" instead.`, "IMPORT_BLOCKED", 422);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.9" },
      });
    } catch {
      throw new AppError("The page took too long or could not be reached. Try again, or paste the product details instead.", "IMPORT_UNREACHABLE", 422);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 503) {
      throw blockedMsg(siteName(url.toString()) || "This website");
    }
    if (!res.ok) throw new AppError(`The page returned an error (${res.status}). Check the link, or paste the product details instead.`, "IMPORT_FAILED", 422);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) throw new AppError("That link isn't a product web page.", "IMPORT_FAILED", 422);
    const html = await readCapped(res);
    if (BLOCKING_SITES.test(url.hostname) && html.length < 5000) throw blockedMsg(siteName(url.toString()));
    return { html, finalUrl: url.toString() };
  }
  throw new AppError("Too many redirects.", "IMPORT_FAILED", 422);
}

export async function importFromUrl(raw: string, storeName: string): Promise<ImportedListing> {
  const { html, finalUrl } = await fetchProductPage(raw);
  const listing = composeListing(extractFromHtml(html), { storeName, url: raw.trim() || finalUrl });
  if (!listing.name) {
    throw new AppError("Couldn't find product details on that page (it may need a login or load details with JavaScript). Paste the product details instead.", "IMPORT_EMPTY", 422);
  }
  return listing;
}
