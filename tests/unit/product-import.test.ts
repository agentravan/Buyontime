import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, composeListing, extractFromHtml, parsePastedText, splitSizes, suggestSku } from "@/lib/product-import";
import { isPrivateIp } from "@/lib/net";

const AMAZON = `<html><head><title>Amazon.in: Buy Stuff</title>
<meta name="description" content="Buy Boult Audio Z40 True Wireless at best price on Amazon.in"></head><body>
<span id="productTitle" class="a-size-large">   Boult Audio Z40 True Wireless in Ear Earbuds with 60H Playtime, Zen&trade; ENC Mic   </span>
<a id="bylineInfo" href="/boult">Visit the Boult Store</a>
<div id="feature-bullets"><ul>
<li><span class="a-list-item">【60 Hours Playtime】 Enjoy music all day with the charging case.</span></li>
<li><span class="a-list-item">Zen ENC mic for clear calls even in traffic.</span></li>
<li><span class="a-list-item">Buy now at the lowest price with great offers</span></li>
<li><span class="a-list-item">IPX5 water resistance for workouts.</span></li>
</ul></div>
<table id="productDetails_techSpec_section_1">
<tr><th class="a-color-secondary">Colour</th><td>Black</td></tr>
<tr><th>Connectivity Technology</th><td>Bluetooth 5.3</td></tr>
<tr><th>ASIN</th><td>B0ABCDEF12</td></tr>
<tr><th>Customer Reviews</th><td>4.1 out of 5</td></tr>
<tr><th>Manufacturer</th><td>Some Company, full address here</td></tr>
</table></body></html>`;

const FLIPKART = `<html><head>
<meta property="og:title" content="Mivi Duopods K2 Bluetooth Headset Price in India - Buy Mivi Duopods K2 Online - Mivi : Flipkart.com">
<script type="application/ld+json">[{"@context":"https://schema.org","@type":"Product","name":"Mivi Duopods K2, 40Hrs PT, HD Call, Fast Charging","description":"Buy Mivi Duopods K2 for Rs.2999.0 Online, Also get Specs & Features. Only Genuine Products. 30 Day Replacement Guarantee. Free Shipping. Cash On Delivery!","brand":{"@type":"Brand","name":"Mivi"},"image":["https://img/x.jpg"],"offers":{"price":"2999"}}]</script>
</head><body>
<div>Highlights</div><ul><li class="x">40 Hours playback</li><li class="x">Fast charging: 10 min = 500 min</li><li>HD calls with quad mic</li></ul>
<div>Specifications</div><table><tr><td>Model Name</td><td><ul><li>Duopods K2</li></ul></td></tr><tr><td>Color</td><td><ul><li>Black</li></ul></td></tr></table>
</body></html>`;

const MEESHO_SHARE = `*Aakarsha Pretty Rayon Kurtis*
Fabric: Rayon
Sleeve Length: Three-Quarter Sleeves
Pattern: Printed
Combo of: Single
Sizes:
S (Bust Size: 36 in, Size Length: 44 in)
M (Bust Size: 38 in, Size Length: 44 in)
L (Bust Size: 40 in, Size Length: 44 in)
XL (Bust Size: 42 in, Size Length: 44 in)
Price: ₹349
Dispatch: 2-3 Days
Easy to wash and comfortable for daily wear
https://www.meesho.com/s/p/abc123`;

test("Amazon page: title, brand, clean bullets and useful specs — no ASIN, reviews, manufacturer or sales copy", () => {
  const ex = extractFromHtml(AMAZON);
  assert.equal(ex.title, "Boult Audio Z40 True Wireless in Ear Earbuds with 60H Playtime, Zen™ ENC Mic");
  assert.equal(ex.brand, "Boult");
  assert.deepEqual(ex.bullets, ["60 Hours Playtime: Enjoy music all day with the charging case.", "Zen ENC mic for clear calls even in traffic.", "IPX5 water resistance for workouts."]);
  assert.deepEqual(ex.specs.map((s) => s.label), ["Colour", "Connectivity Technology"]);
});

test("Flipkart page: JSON-LD name/brand, marketplace boilerplate dropped, highlights and spec table read", () => {
  const ex = extractFromHtml(FLIPKART);
  assert.equal(ex.title, "Mivi Duopods K2, 40Hrs PT, HD Call, Fast Charging");
  assert.equal(ex.brand, "Mivi");
  assert.deepEqual(ex.bullets, ["40 Hours playback", "Fast charging: 10 min = 500 min", "HD calls with quad mic"]);
  assert.deepEqual(ex.specs, [{ label: "Model Name", value: "Duopods K2" }, { label: "Color", value: "Black" }]);
  const l = composeListing(ex, { storeName: "Buyontime", url: "https://www.flipkart.com/x/p/itm1" });
  assert.ok(!/Rs\.|Genuine|Replacement|Free Shipping|flipkart/i.test(l.description), "no marketplace sales copy in our description");
  assert.ok(l.description.startsWith("Mivi Duopods K2, 40Hrs PT, HD Call, Fast Charging — 40 Hours playback."));
  assert.match(l.description, /Key features\n• Fast charging: 10 min = 500 min\n• HD calls with quad mic/);
  assert.match(l.description, /Why shop at Buyontime/);
  assert.equal(l.sourceName, "Flipkart");
});

test("Meesho share text: name, specs, sizes; price, dispatch and link are ignored", () => {
  const ex = parsePastedText(MEESHO_SHARE);
  assert.equal(ex.title, "Aakarsha Pretty Rayon Kurtis");
  assert.deepEqual(ex.sizes, ["S", "M", "L", "XL"]);
  assert.deepEqual(ex.specs.map((s) => `${s.label}=${s.value}`), ["Fabric=Rayon", "Sleeve Length=Three-Quarter Sleeves", "Pattern=Printed", "Combo of=Single"]);
  assert.ok(!JSON.stringify(ex).includes("349"), "price is never imported");
  const l = composeListing(ex, { storeName: "Buyontime" });
  assert.equal(l.name, "Aakarsha Pretty Rayon Kurtis");
  assert.match(l.description, /^Aakarsha Pretty Rayon Kurtis — easy to wash and comfortable for daily wear\./);
  assert.match(l.description, /At a glance\n• Fabric: Rayon/);
  assert.ok(l.description.length >= 10);
});

test("home pages, error pages and bot checks never become a product name", () => {
  for (const title of ["Online Shopping India Mobile, Cameras, Lifestyle & more Online @ Flipkart.com", "503 - Service Unavailable Error", "Amazon.in: Robot Check", "Sign in"]) {
    assert.equal(extractFromHtml(`<html><head><title>${title}</title></head><body></body></html>`).title, "", title);
  }
});

test("live Flipkart shape: sales copy with a price never leaks; features come from the title when the page has no list", () => {
  const html = `<html><head><title>x</title><meta name="Description" content="Buy boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery for Rs.3990.0 Online, Also get boAt Airdopes 141 Gen 2 Specs &amp; Features. Only Genuine Products. 30 Day Replacement Guarantee. Free Shipping. Cash On Delivery!">
<script type="application/ld+json">{"@type":"Product","name":"boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery,ASAP Charge,Low Latency","brand":{"name":"boAt"},"color":"Grey"}</script></head><body></body></html>`;
  const l = composeListing(extractFromHtml(html), { storeName: "Buyontime", url: "https://www.flipkart.com/x/p/itm1" });
  assert.ok(!/\bRs\b|for .* Online|Specs & Features|Genuine/i.test(l.description), l.description);
  assert.match(l.description, /^boAt Airdopes 141 Gen 2, 4 Mics ENx Tech,48H Battery,ASAP Charge,Low Latency — in Grey\./);
  assert.match(l.description, /Key features\n• 4 Mics ENx Tech\n• 48H Battery\n• ASAP Charge\n• Low Latency/);
  assert.equal(l.brand, "boAt");
});

test("titles lose marketplace suffixes", () => {
  assert.equal(cleanTitle("Cotton Kurta for Men : Amazon.in: Fashion"), "Cotton Kurta for Men");
  assert.equal(cleanTitle("Steel Bottle 1L Price in India - Buy Steel Bottle 1L Online - Milton : Flipkart.com"), "Steel Bottle 1L");
  assert.equal(cleanTitle("Printed Saree | Meesho"), "Printed Saree");
  assert.equal(cleanTitle("Buy Floral Dress Online at Myntra"), "Floral Dress");
});

test("sizes, SKU suggestion and private-address guard", () => {
  assert.deepEqual(splitSizes("S, M, L, XL, Free Size"), ["S", "M", "L", "XL", "Free Size"]);
  assert.equal(suggestSku("Aakarsha Pretty Rayon Kurtis", () => 0.5), "AAK-PRE-550");
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "104.18.2.3", "2606:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});
