import "server-only";
import { isPincode, parseGoogleGeocode, parseIndiaPost, type PincodeInfo } from "@/lib/pincode";

async function getJson(url: string): Promise<unknown> {
  // Never hold the customer up for more than a few seconds.
  const res = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`pincode lookup HTTP ${res.status}`);
  return res.json();
}

/**
 * Looks a pincode up. Google Maps (Geocoding API) is used when GOOGLE_MAPS_API_KEY is set; the India Post
 * directory is the fallback and the default. Returns null if nothing is found or the services are down —
 * the customer can always type the city and state themselves.
 */
export async function lookupPincode(pincode: string): Promise<PincodeInfo | null> {
  if (!isPincode(pincode)) return null;
  const hit = found.get(pincode);
  if (hit) return hit;
  const info = await fetchPincode(pincode);
  if (info) {
    if (found.size > 2000) found.clear();
    found.set(pincode, info);
  }
  return info;
}

/** Pincodes change rarely: answers are remembered while this server instance is warm. */
const found = new Map<string, PincodeInfo>();

async function fetchPincode(pincode: string): Promise<PincodeInfo | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  let google: PincodeInfo | null = null;
  if (key) {
    try {
      google = parseGoogleGeocode(
        await getJson(`https://maps.googleapis.com/maps/api/geocode/json?components=${encodeURIComponent(`postal_code:${pincode}|country:IN`)}&region=in&key=${encodeURIComponent(key)}`),
        pincode,
      );
    } catch (e) {
      console.error("[pincode] google lookup failed", e instanceof Error ? e.message : e);
    }
    if (google?.state && google.district) return google;
  }
  try {
    const post = parseIndiaPost(await getJson(`https://api.postalpincode.in/pincode/${pincode}`), pincode);
    if (post) return google ? { ...post, city: google.city || post.city } : post;
  } catch (e) {
    console.error("[pincode] india post lookup failed", e instanceof Error ? e.message : e);
  }
  return google;
}
