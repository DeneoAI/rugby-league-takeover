import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Regression guard for the "About Us opens Travel Packages / Events opens
// Travel Packages" bug. Root cause: the home page lazy-loads its sections, so a
// smooth `scrollIntoView` animates THROUGH the placeholders, which hydrate and
// grow mid-scroll and shove the target down — landing on an earlier section.
// The fix routes every home-anchor scroll through the shared scrollToAnchor
// helper, which jumps (no fly-through) and re-pins until layout settles.

test("the shared scroll helper jumps + re-pins instead of a fly-through smooth scroll", () => {
  const src = read("../src/lib/scroll-to-anchor.js");
  assert.ok(src.includes("export function scrollToAnchor"), "helper is exported");
  // It jumps directly and keeps correcting until the target position is stable,
  // rather than smooth-scrolling through the lazy sections.
  assert.ok(src.includes("window.scrollTo"), "jumps directly to the computed offset");
  assert.ok(/stable\s*>=/.test(src), "re-pins until the position is stable across frames");
  assert.ok(src.includes("prescroll"), "supports lazy-nested targets (e.g. #travel-registration)");
});

test("every home-anchor scroll call site routes through the shared helper", () => {
  const callSites = [
    "../src/components/public/SiteNav.jsx",
    "../src/components/public/PublicLayout.jsx",
    "../src/pages/Home.jsx",
    "../src/components/public/HeroSection.jsx",
    "../src/components/public/NewsSection.jsx",
  ];
  for (const path of callSites) {
    const src = read(path);
    assert.ok(src.includes("scrollToAnchor"), `${path} uses the shared helper`);
    assert.ok(
      !src.includes('scrollIntoView({ behavior: "smooth" })'),
      `${path} must not re-introduce the fly-through smooth scroll`
    );
  }
});

test("home section anchors are unique (no duplicate #about)", () => {
  const home = read("../src/pages/Home.jsx");
  const about = read("../src/components/public/AboutSection.jsx");
  // The anchor lives on the Home wrapper (which carries the scroll offset); the
  // section component must not duplicate the id.
  assert.ok(/id="about"/.test(home), "home wrapper owns the #about anchor");
  assert.ok(!/id="about"/.test(about), "AboutSection must not duplicate the #about id");
});

test("the jump is instant even though <html> has scroll-behavior: smooth", () => {
  // A bare window.scrollTo(x, y) inherits the CSS smooth behaviour and animates
  // through the lazy sections — About Us landed on News/Merch because of it.
  const src = read("../src/lib/scroll-to-anchor.js");
  assert.ok(src.includes('scrollBehavior = "auto"'), "switches the smooth rule off for the jump");
  assert.ok(!src.includes('behavior: "instant"'), "avoids behavior: instant (TypeError on older iOS Safari)");
  // The drawer's scroll-restore must not glide from the top either.
  const nav = read("../src/components/public/SiteNav.jsx");
  assert.ok(nav.includes("jumpTo(scrollYRef.current)"), "menu close restores the scroll instantly");
});

test("an anchor jump hydrates the lazy sections and waits for them to load", () => {
  const src = read("../src/lib/scroll-to-anchor.js");
  const lazy = read("../src/components/public/LazySection.jsx");
  assert.ok(src.includes("HYDRATE_EVENT") && lazy.includes("HYDRATE_EVENT"), "LazySection listens for the hydrate event");
  assert.ok(src.includes("[data-section-loading]") && lazy.includes("data-section-loading"), "settling waits for loading sections");
});
