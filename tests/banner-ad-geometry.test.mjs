import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Strip comment lines so these assertions match CODE, not the prose that
// explains it — a comment mentioning a value is not the value being set.
const code = (p) =>
  fs
    .readFileSync(new URL(p, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

test("banner slots keep their padding on the wrapper, not on the slot", () => {
  const layout = code("../src/components/public/PublicLayout.jsx");
  const slot = layout.match(/<AdSlot\s+position="banner-top"[\s\S]*?\/>/)?.[0];
  assert.ok(slot, "banner-top AdSlot not found in PublicLayout");

  // Vertical padding on the AdSlot itself is subtracted from the reserved
  // aspect-ratio box rather than added around it, so a 728×90 leaderboard
  // overflows the slot and paints over the page content beneath it.
  assert.doesNotMatch(slot, /\b(pt-|pb-|py-)/, "banner-top slot must carry no vertical padding");

  // Nav clearance still has to exist — it just belongs on the wrapper. The
  // fixed header is 80px (5rem); 4.5rem tucked the banner's top 8px under it.
  assert.match(layout, /border-b border-border\/30[^"]*pt-\[calc\(5rem\+env\(safe-area-inset-top,0px\)\)\]/);
});

test("the top banner paints above the fixed background video layer", () => {
  // BackgroundVideo is `fixed inset-0 z-0`; an unpositioned banner wrapper is
  // painted underneath it, so a loaded ad was invisible on Home/Store/Gallery.
  const layout = code("../src/components/public/PublicLayout.jsx");
  assert.match(layout, /empty:hidden relative z-10 w-full border-b/);
});

test("a slot only collapses after the ads query has answered", () => {
  // Reporting hasAd:false unmounts the runtime for good, so it must not be
  // reported from the empty first render, before the ads have loaded.
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");
  assert.match(runtime, /isFetched: adsFetched/);
  assert.match(runtime, /hasAd: !adsFetched \|\| hasCandidate \|\| isAdmin/);
});

test("full-width banner strips use the banner fallback chain", () => {
  assert.match(code("../src/components/public/PublicLayout.jsx"), /position="banner-top"\s+size="banner"/);
  for (const page of ["../src/pages/Home.jsx", "../src/pages/Store.jsx"]) {
    assert.match(code(page), /position="banner-bottom" size="banner"/, `${page} banner-bottom`);
  }
});

test("the banner chain stays a strip on phones", () => {
  const ad = code("../src/components/ads/AdSlot.jsx");

  // A banner position caps the creative at 120px tall (AdSlotRuntime), so a
  // 300×250 fallback would render 144×120 marooned inside a 250px box.
  assert.match(ad, /"large-mobile-banner":\s*\{\s*w:\s*320,\s*h:\s*100/);

  const chain = ad.match(/\bbanner:\s*(\[[^\]]*\](?:[^;\n]*\])*)/)?.[1];
  assert.ok(chain, "banner fallback chain not found");
  assert.doesNotMatch(chain, /medium-rectangle/, "a banner strip must not fall back to a rectangle");
  assert.match(chain, /\{ minW: 728, key: "leaderboard" \}/);
  // 280 so a 320px viewport (288px container after the gutter) still gets the
  // 320×100 strip — at minW 320 it fell to 320×50 and a single mobile
  // creative overflowed its slot by 40px on those phones.
  assert.match(chain, /\{ minW: 280, key: "large-mobile-banner" \}/);
  assert.match(chain, /\{ minW: 0, key: "mobile-banner" \}/);
});

test("admin can label a creative with the large mobile banner size", () => {
  assert.match(
    code("../src/components/admin/AdsManager.jsx"),
    /key:\s*"large-mobile-banner",\s*label:\s*"Large Mobile Banner",\s*dim:\s*"320 × 100"/,
  );
});

test("the phone banner stretches to the screen instead of stopping at 320px", () => {
  const ad = code("../src/components/ads/AdSlot.jsx");

  // 320 is the IAB unit width, but phones are 360-430pt wide, so a slot
  // capped at 320 covered only 74% of a 430pt screen.
  assert.match(ad, /"large-mobile-banner":\s*\{[^}]*fill: true/);
  assert.match(ad, /"mobile-banner":\s*\{[^}]*fill: true/);
  assert.match(ad, /maxWidth: preset\.fill \? "100%" : preset\.w/);

  // The desktop leaderboard deliberately does NOT stretch — 728 centred in
  // the content column is the standard placement.
  const leaderboard = ad.match(/^\s*leaderboard:\s*\{[^}]*\}/m)?.[0];
  assert.ok(leaderboard, "leaderboard preset not found");
  assert.doesNotMatch(leaderboard, /fill/);
});

test("nothing boxes the top banner in from the screen edge", () => {
  const layout = code("../src/components/public/PublicLayout.jsx");
  const wrapper = layout.match(/<div className="empty:hidden[^"]*"/)?.[0];
  assert.ok(wrapper, "banner wrapper not found");
  // A horizontal gutter on the wrapper is what kept a full-bleed banner off
  // the screen edge; vertical padding (nav clearance) must stay.
  assert.doesNotMatch(wrapper, /\b(px-|pl-|pr-)\d/, "banner wrapper must have no horizontal gutter");
  assert.match(wrapper, /pt-\[calc\(/, "nav clearance must remain");
});

test("the creative scales up to the slot, not just down", () => {
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");
  const img = runtime.match(/<img\s+src=\{imgSrc\}[\s\S]*?\/>/)?.[0];
  assert.ok(img, "creative img not found");
  // width/height auto only ever scaled DOWN, so a 320-wide file sat at 320
  // inside a 430 slot.
  assert.doesNotMatch(img, /width: "auto"/);
  assert.match(img, /width: "100%"/);
  assert.match(img, /height: "100%"/);
  // contain, never cover: a mismatched ratio must letterbox, not crop.
  assert.match(img, /object-contain/);
});
