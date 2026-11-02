import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sizedImage, LOGO_WIDTH } from "../src/lib/storage-image.js";

const code = (p) =>
  fs
    .readFileSync(new URL(p, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

const STORAGE = "https://x.supabase.co/storage/v1/object/public/media/uploads/logo.png";

test("a storage object is rewritten to a sized render URL", () => {
  assert.equal(
    sizedImage(STORAGE, 640),
    "https://x.supabase.co/storage/v1/render/image/public/media/uploads/logo.png?width=640&quality=75",
  );
});

test("anything that is not a storage object is left untouched", () => {
  for (const src of ["/icons/icon-192.png", "https://example.com/a.png", "data:image/png;base64,AAA", "", null, undefined]) {
    assert.equal(sizedImage(src, 640), String(src || ""), `should pass through: ${src}`);
  }
});

test("a URL that already carries a query is not rewritten", () => {
  // Could be a cache-buster or a deliberately tuned transform; fighting over
  // query parameters would break whichever one loses.
  const tuned = `${STORAGE}?width=100`;
  assert.equal(sizedImage(tuned, 640), tuned);
});

test("a nonsense width is ignored rather than put in the URL", () => {
  for (const w of [0, -10, NaN, undefined, "wide"]) {
    assert.equal(sizedImage(STORAGE, w), STORAGE, `width ${w} should be rejected`);
  }
});

test("nav and hero ask for the same logo variant", () => {
  // Different widths would mean two downloads of the same logo.
  for (const f of ["../src/components/public/HeroSection.jsx", "../src/components/public/SiteNav.jsx"]) {
    assert.match(code(f), /sizedImage\(settings\.site_logo_url, LOGO_WIDTH\)/, f);
  }
  assert.equal(typeof LOGO_WIDTH, "number");
});

test("the hero logo stays hidden until it has fully loaded", () => {
  // The entry animation runs on mount regardless of the download, so without
  // this the element was fully opaque over a half-painted image.
  const hero = code("../src/components/public/HeroSection.jsx");
  assert.match(hero, /onLoad=\{\(\) => setLogoLoaded\(true\)\}/);
  assert.match(hero, /animate=\{\{ opacity: logoLoaded \? 1 : 0/);
});
