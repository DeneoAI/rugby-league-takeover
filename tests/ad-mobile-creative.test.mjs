import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code = (p) =>
  fs
    .readFileSync(new URL(p, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

test("one ad can carry a desktop and a mobile creative", () => {
  const admin = code("../src/components/admin/AdsManager.jsx");
  assert.match(admin, /image_url_mobile: ""/, "new ads need the field in state");
  assert.match(admin, /label="Ad Creative — Mobile \(optional\)"/);
  assert.match(admin, /value=\{editing\.image_url_mobile \|\| ""\}/);
});

test("an unset mobile creative is stripped before the write", () => {
  // The column ships in migration 0041. Sending the key to a database that has
  // not run it yet fails EVERY ad save, not only ones using the new field.
  const admin = code("../src/components/admin/AdsManager.jsx");
  assert.match(admin, /if \(!payload\.image_url_mobile\) delete payload\.image_url_mobile;/);
});

test("a rejected ad save is reported instead of swallowed", () => {
  const admin = code("../src/components/admin/AdsManager.jsx");
  const saveAd = admin.match(/const saveAd = useCallback[\s\S]*?\}, \[saveMutation\]\);/)?.[0];
  assert.ok(saveAd, "saveAd not found");
  assert.match(saveAd, /onError:/, "saveAd must handle failure");
  assert.match(saveAd, /migration 0041/, "a missing column should name its migration");
  // A size the database's check constraint has not learned yet is the other
  // way the admin UI can run ahead of the schema.
  assert.match(saveAd, /site_ads_size_check/);
  assert.match(saveAd, /migration 0039/);
});

test("device targeting sits with position and size, not with the rates", () => {
  const admin = code("../src/components/admin/AdsManager.jsx");
  const posIdx = admin.indexOf(">Position</label>");
  const deviceIdx = admin.indexOf(">Device Target</label>");
  const rateIdx = admin.indexOf(">Monthly Rate (AUD)</label>");
  assert.ok(posIdx > -1 && deviceIdx > -1 && rateIdx > -1);
  // On a phone the form stacks in source order, so a Device Target that comes
  // after the two money fields reads as "there is no mobile option at all".
  assert.ok(deviceIdx < rateIdx, "Device Target must come before the rate fields");
});

test("the mobile creative is used only for mobile banner presets", () => {
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");

  const presets = runtime.match(/MOBILE_BANNER_PRESETS = new Set\(\[([^\]]*)\]\)/)?.[1];
  assert.ok(presets, "preset set not found");
  assert.match(presets, /"large-mobile-banner"/);
  assert.match(presets, /"mobile-banner"/);
  // A 320×100 strip inside a 300×250 in-feed rectangle would be a sliver.
  assert.doesNotMatch(presets, /medium-rectangle/);

  const fn = runtime.match(/function creativeFor\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, "creativeFor not found");
  assert.match(fn, /ad\.image_url_mobile/);
  assert.match(fn, /return ad\.image_url \|\| ""/, "must fall back to the desktop creative");
});

test("every image path uses the resolved creative, not image_url", () => {
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");
  // The retry-with-cachebuster path reused currentAd.image_url, so a failed
  // mobile creative retried the DESKTOP file and silently swapped artwork.
  const retry = runtime.match(/const handleImgError = useCallback\([\s\S]*?\}, \[[^\]]*\]\);/)?.[0];
  assert.ok(retry, "handleImgError not found");
  assert.doesNotMatch(retry, /currentAd\.image_url/);
  assert.match(retry, /resolvedCreative/);
});

test("migration 0041 adds the column without disturbing existing ads", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/0041_site_ads_mobile_creative.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists image_url_mobile text/);
  assert.doesNotMatch(sql, /not null/i, "a new column on a live table must be nullable");
  assert.doesNotMatch(sql, /drop (column|table)/i);
});

test("the whole slot is the tap target, not just the artwork", () => {
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");

  const fn = runtime.match(/function LinkOrStatic\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, "LinkOrStatic not found");
  // Fills the slot and centres the creative, so the empty space around a
  // wrong-shaped creative still opens the sponsor. With a desktop-only
  // creative on a phone this was 39% of the banner vs 100%.
  assert.match(fn, /h-full w-full/);
  assert.match(fn, /items-center justify-center/);

  // An ad with no destination must not be a link: href="#" plus
  // target="_blank" opened a blank tab on tap.
  assert.match(fn, /if \(!href\) return <div className=\{fill\}>\{children\}<\/div>;/);
  assert.doesNotMatch(runtime, /\? currentAd\.target_url : "#"/);

  // The card has to fill the reserved box or the link cannot either.
  assert.match(runtime, /width: "100%",\n\s*height: "100%",\n\s*transition: "box-shadow/);
});

test("a creative is bounded by its slot, not by a fixed pixel cap", () => {
  const runtime = code("../src/components/ads/AdSlotRuntime.jsx");
  // The old cap (120px banner / 250px otherwise) let a wrong-shaped creative
  // render taller than its own slot and spill over the page content.
  assert.doesNotMatch(runtime, /maxHeight: position\?\.startsWith\("banner"\) \? 120 : 250/);
  assert.match(runtime, /maxHeight: "100%"/);
});
