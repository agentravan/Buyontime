import { test } from "node:test";
import assert from "node:assert/strict";
import { isPincode, matchState, parseGoogleGeocode, parseIndiaPost } from "@/lib/pincode";

const office = (o: Record<string, string | null>) => ({ Description: null, BranchType: "Sub Post Office", DeliveryStatus: "Delivery", Country: "India", ...o });

test("pincode format", () => {
  assert.ok(isPincode("122001"));
  assert.ok(!isPincode("022001"));
  assert.ok(!isPincode("12200"));
  assert.ok(!isPincode("12200a"));
});

test("state names from the sources map onto the store's list", () => {
  assert.equal(matchState("Haryana"), "Haryana");
  assert.equal(matchState("TAMIL NADU"), "Tamil Nadu");
  assert.equal(matchState("Jammu & Kashmir"), "Jammu and Kashmir");
  assert.equal(matchState("NCT of Delhi"), "Delhi");
  assert.equal(matchState("Orissa"), "Odisha");
  assert.equal(matchState("Pondicherry"), "Puducherry");
  assert.equal(matchState("The Dadra And Nagar Haveli And Daman And Diu"), "Dadra and Nagar Haveli and Daman and Diu");
  assert.equal(matchState("Atlantis"), "");
  assert.equal(matchState(null), "");
});

test("India Post: offices disagree on the block, so the district is the city", () => {
  const json = [{ Message: "Number of pincode(s) found:3", Status: "Success", PostOffice: [
    office({ Name: "Arjun Nagar", District: "Gurgaon", Block: "Arjun Nagar", State: "Haryana", Pincode: "122001" }),
    office({ Name: "Basai Road", District: "Gurgaon", Block: "Basai Road", State: "Haryana", Pincode: "122001" }),
    office({ Name: "Gurgaon", District: "Gurgaon", Block: "Sadar Bazar", State: "Haryana", Pincode: "122001" }),
  ] }];
  assert.deepEqual(parseIndiaPost(json, "122001"), { pincode: "122001", city: "Gurgaon", district: "Gurgaon", state: "Haryana", areas: ["Arjun Nagar", "Basai Road", "Gurgaon"] });
});

test("India Post: a single agreed block is used as the city; junk blocks are ignored", () => {
  const one = [{ Status: "Success", PostOffice: [
    office({ Name: "Sohna", District: "Gurgaon", Block: "Sohna", State: "Haryana" }),
    office({ Name: "Damdama", District: "Gurgaon", Block: "Sohna", State: "Haryana" }),
  ] }];
  assert.equal(parseIndiaPost(one, "122103")?.city, "Sohna");
  assert.equal(parseIndiaPost(one, "122103")?.district, "Gurgaon");
  const junk = [{ Status: "Success", PostOffice: [office({ Name: "X", District: "Pune", Block: "NA", State: "Maharashtra" })] }];
  assert.equal(parseIndiaPost(junk, "411001")?.city, "Pune");
});

test("India Post: unknown pincode or malformed answers give null", () => {
  assert.equal(parseIndiaPost([{ Message: "No records found", Status: "Error", PostOffice: null }], "999999"), null);
  assert.equal(parseIndiaPost({}, "122001"), null);
  assert.equal(parseIndiaPost(null, "122001"), null);
  assert.equal(parseIndiaPost([{ Status: "Success", PostOffice: [] }], "122001"), null);
});

test("Google Geocoding: locality, district and state are read; a different pincode is rejected", () => {
  const json = { status: "OK", results: [{ address_components: [
    { long_name: "122001", types: ["postal_code"] },
    { long_name: "Sector 14", types: ["sublocality_level_1", "sublocality", "political"] },
    { long_name: "Gurugram", types: ["locality", "political"] },
    { long_name: "Gurugram", types: ["administrative_area_level_3", "political"] },
    { long_name: "Haryana", types: ["administrative_area_level_1", "political"] },
    { long_name: "India", types: ["country", "political"] },
  ] }] };
  assert.deepEqual(parseGoogleGeocode(json, "122001"), { pincode: "122001", city: "Gurugram", district: "Gurugram", state: "Haryana", areas: ["Sector 14"] });
  assert.equal(parseGoogleGeocode(json, "110001"), null);
  assert.equal(parseGoogleGeocode({ status: "ZERO_RESULTS", results: [] }, "122001"), null);
  assert.equal(parseGoogleGeocode({ status: "REQUEST_DENIED" }, "122001"), null);
});
