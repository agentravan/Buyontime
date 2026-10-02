import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedImageSource, bulkItemSchema, specList, variantSku } from "@/lib/bulk-import";

test("pictures are only copied from the listed marketplace image hosts, over https", () => {
  assert.equal(allowedImageSource("https://images.meesho.com/images/products/1/a_512.webp"), "https://images.meesho.com/images/products/1/a_512.webp");
  assert.ok(allowedImageSource("https://rukminim2.flixcart.com/image/480/640/x/y.jpeg"));
  assert.equal(allowedImageSource("http://assets.myntassets.com/assets/images/a.jpg"), "https://assets.myntassets.com/assets/images/a.jpg");
  assert.equal(allowedImageSource("https://images.meesho.com.evil.example/a.webp"), null);
  assert.equal(allowedImageSource("https://example.com/a.jpg"), null);
  assert.equal(allowedImageSource("https://169.254.169.254/latest/meta-data"), null);
  assert.equal(allowedImageSource("https://images.meesho.com:8443/a.webp"), null);
  assert.equal(allowedImageSource("https://user:pw@images.meesho.com/a.webp"), null);
  assert.equal(allowedImageSource("file:///etc/passwd"), null);
  assert.equal(allowedImageSource("not a url"), null);
});

test("variant SKUs and specs", () => {
  assert.equal(variantSku("BOT-001", "Default", true), "BOT-001");
  assert.equal(variantSku("BOT-008", "XXL", false), "BOT-008-XXL");
  assert.equal(variantSku("BOT-012", "Free Size", false), "BOT-012-FREESIZE");
  assert.deepEqual(specList({ Fabric: "Cotton", Theme: "NA", Empty: " " }), [{ label: "Fabric", value: "Cotton" }]);
});

const row = { sku: "T-1", name: "Test product", description: "A product for the test.", variants: ["S", "M"], payment_option: "ONLINE_AND_COD", cost_price: 100, selling_price: 229, mrp: 229, image_urls: [] };

test("row validation", () => {
  assert.ok(bulkItemSchema.safeParse(row).success);
  assert.equal(bulkItemSchema.safeParse({ ...row, mrp: 200 }).success, false); // MRP below price
  assert.equal(bulkItemSchema.safeParse({ ...row, variants: ["S", "s"] }).success, false);
  assert.equal(bulkItemSchema.safeParse({ ...row, payment_option: "FREE" }).success, false);
  assert.equal(bulkItemSchema.safeParse({ ...row, sku: "bad sku!" }).success, false);
});
