import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { discountIsLive, liveDiscounts, discountStatus } from "../src/lib/membership.js";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const migration = () => read("../supabase/migrations/0038_membership_discounts.sql");
const hours = (n) => new Date(Date.now() + n * 3600000).toISOString();

test("only active discounts inside their window are shown to members", () => {
  assert.equal(discountIsLive({ title: "Bar" }), true, "no window = always on");
  assert.equal(discountIsLive({ title: "Bar", is_active: false }), false, "hidden by admin");
  assert.equal(discountIsLive({ title: "Night", starts_at: hours(2) }), false, "not started yet");
  assert.equal(discountIsLive({ title: "Night", ends_at: hours(-1) }), false, "already over");
  assert.equal(discountIsLive({ title: "Night", starts_at: hours(-1), ends_at: hours(1) }), true);
});

test("live discounts come back in admin sort order", () => {
  const rows = [
    { id: "c", title: "C", sort_order: 3 },
    { id: "x", title: "Hidden", sort_order: 0, is_active: false },
    { id: "a", title: "A", sort_order: 1 },
    { id: "b", title: "B", sort_order: 2 },
  ];
  assert.deepEqual(liveDiscounts(rows).map((d) => d.id), ["a", "b", "c"]);
});

test("the admin list explains why a discount is or isn't showing", () => {
  assert.equal(discountStatus({}), "live");
  assert.equal(discountStatus({ is_active: false }), "hidden");
  assert.equal(discountStatus({ starts_at: hours(5) }), "scheduled");
  assert.equal(discountStatus({ ends_at: hours(-5) }), "ended");
});

test("discounts are admin-written and only live rows are public", () => {
  const sql = migration();
  assert.match(sql, /create table if not exists public\.membership_discounts/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for all\s+using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.match(sql, /for select\s+using \(\s+public\.is_admin\(\)\s+or \(\s+is_active/);
});

test("the admin manager, member view and staff check all use the same entity", () => {
  assert.match(read("../src/api/base44Client.js"), /MembershipDiscount: 'membership_discounts'/);
  assert.match(read("../src/components/admin/panels/StorePanel.jsx"), /MembershipDiscountsManager/);
  assert.match(read("../src/components/membership/MemberPerks.jsx"), /liveDiscounts/);
  assert.match(read("../src/components/account/MembershipTab.jsx"), /useMemberPerks/);
  assert.match(read("../supabase/functions/membershipCard/index.ts"), /perks: await livePerks\(svc\)/);
});
