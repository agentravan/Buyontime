/**
 * Pincode → city / district / state. Pure parsing (no network) so it can be unit-tested.
 * Two sources: Google Geocoding (when GOOGLE_MAPS_API_KEY is set) and the India Post pincode directory.
 */

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export type PincodeInfo = {
  pincode: string;
  city: string;
  district: string;
  /** One of INDIAN_STATES, or "" when the source's state name could not be matched. */
  state: string;
  /** Locality / post office names in this pincode, for the "Area" field suggestions. */
  areas: string[];
};

export function isPincode(v: string): boolean {
  return /^[1-9]\d{5}$/.test(v);
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

const STATE_ALIASES: Record<string, string> = {
  nctofdelhi: "Delhi", newdelhi: "Delhi", orissa: "Odisha", pondicherry: "Puducherry", uttaranchal: "Uttarakhand",
  chattisgarh: "Chhattisgarh", andamanandnicobar: "Andaman and Nicobar Islands",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu", damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  thedadraandnagarhavelianddamananddiu: "Dadra and Nagar Haveli and Daman and Diu", telengana: "Telangana",
};

/** Maps a source's state name onto the store's own list of states. */
export function matchState(raw: string | null | undefined): string {
  if (!raw) return "";
  const n = norm(raw);
  if (!n) return "";
  return INDIAN_STATES.find((s) => norm(s) === n) ?? STATE_ALIASES[n] ?? "";
}

const tidy = (s: unknown): string => {
  const v = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
  return /^(na|n\/a|null|-)?$/i.test(v) ? "" : v;
};

/** Parses a response from https://api.postalpincode.in/pincode/{pin}. Returns null when the pincode is unknown. */
export function parseIndiaPost(json: unknown, pincode: string): PincodeInfo | null {
  const first = Array.isArray(json) ? json[0] : null;
  if (!first || typeof first !== "object") return null;
  const offices = (first as { PostOffice?: unknown }).PostOffice;
  if ((first as { Status?: unknown }).Status !== "Success" || !Array.isArray(offices) || offices.length === 0) return null;
  const rows = offices.filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object");
  const district = tidy(rows[0]?.District);
  const state = matchState(tidy(rows[0]?.State));
  if (!district && !state) return null;
  // "Block" is the town/taluk when every post office in the pincode agrees on it; otherwise the district is the safest city.
  const blocks = [...new Set(rows.map((r) => tidy(r.Block)).filter(Boolean))];
  const city = blocks.length === 1 ? blocks[0] : district;
  const areas = [...new Set(rows.map((r) => tidy(r.Name)).filter(Boolean))].slice(0, 30);
  return { pincode, city: city || district, district, state, areas };
}

/** Parses a Google Geocoding API response for `components=postal_code:PIN|country:IN`. */
export function parseGoogleGeocode(json: unknown, pincode: string): PincodeInfo | null {
  if (!json || typeof json !== "object" || (json as { status?: unknown }).status !== "OK") return null;
  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  type Comp = { long_name?: string; types?: string[] };
  const comps: Comp[] = Array.isArray((results[0] as { address_components?: unknown }).address_components)
    ? ((results[0] as { address_components: Comp[] }).address_components)
    : [];
  const get = (type: string) => tidy(comps.find((c) => c.types?.includes(type))?.long_name);
  // The result must be for this pincode in India.
  if (get("postal_code") !== pincode || (get("country") && get("country") !== "India")) return null;
  const district = get("administrative_area_level_3") || get("administrative_area_level_2");
  const city = get("locality") || district;
  const state = matchState(get("administrative_area_level_1"));
  if (!city && !state) return null;
  const areas = [...new Set(comps.filter((c) => c.types?.some((t) => t.startsWith("sublocality"))).map((c) => tidy(c.long_name)).filter(Boolean))];
  return { pincode, city, district: district || city, state, areas };
}
