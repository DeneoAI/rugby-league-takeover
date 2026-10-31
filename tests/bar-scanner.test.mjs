import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  isBarAccessCode, normaliseBarCode, normaliseMemberNumber, parseScannedCode,
  readBarSession, saveBarSession, clearBarSession,
} from "../src/lib/barScanner.js";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const fn = () => read("../supabase/functions/membershipCard/index.ts");

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("the bar access code is exactly 8 digits", () => {
  assert.equal(isBarAccessCode("12345678"), true);
  assert.equal(isBarAccessCode("1234567"), false);
  assert.equal(isBarAccessCode("123456789"), false);
  assert.equal(isBarAccessCode("1234abcd"), false);
  assert.equal(normaliseBarCode("1234 5678 9"), "12345678", "pasted spacing is forgiven");
});

test("staff can type a member number loosely", () => {
  assert.equal(normaliseMemberNumber("rlt-001234"), "RLT-001234");
  assert.equal(normaliseMemberNumber("rlt 1234"), "RLT-001234");
  assert.equal(normaliseMemberNumber("1234"), "RLT-001234");
  assert.equal(normaliseMemberNumber(""), "");
});

test("the scanner reads the card QR URL, a bare token, or a member number", () => {
  const token = "eyJ2IjoxLCJpZCI6ImFiYyJ9.abcdefghijklmnopqrstuvwxyz012345";
  assert.deepEqual(parseScannedCode(`https://rugbyleaguetakeover.com/scan?t=${token}`), { token });
  assert.deepEqual(parseScannedCode(`https://rugbyleaguetakeover.com/verify-member?t=${token}`), { token }, "older cards");
  assert.deepEqual(parseScannedCode(token), { token });
  assert.deepEqual(parseScannedCode("RLT-001234"), { number: "RLT-001234" });
  assert.equal(parseScannedCode("https://example.com/menu"), null, "a random QR is not a member");
  assert.equal(parseScannedCode("hello"), null);
});

test("a bar session is remembered until it expires, and can be locked", () => {
  const storage = memoryStorage();
  const now = Date.now();
  saveBarSession("signed.session", 3600, storage, now);
  assert.equal(readBarSession(storage, now + 1000)?.session, "signed.session");
  assert.equal(readBarSession(storage, now + 3601 * 1000), null, "expired sessions are ignored");
  clearBarSession(storage);
  assert.equal(readBarSession(storage, now), null);
});

test("the code can't be brute-forced and is never readable from the browser", () => {
  const src = fn();
  assert.match(src, /BAR_LOGIN_MAX_FAILURES_PER_IP/);
  assert.match(src, /BAR_LOGIN_MAX_FAILURES_GLOBAL/);
  assert.match(src, /safeEqual\(code, access\.access_code\)/, "constant-time compare");
  assert.match(src, /if \(me\?\.role !== 'admin'\) return json\(\{ error: 'Admins only' \}, 403\)/);
  const sql = read("../supabase/migrations/0040_bar_scanner_access.sql");
  assert.match(sql, /alter table public\.bar_scanner_access enable row level security/);
  assert.doesNotMatch(sql, /create policy[^;]*bar_scanner_access/, "service role only: no RLS policies");
  assert.match(sql, /access_code ~ '\^\[0-9\]\{8\}\$'/);
});

test("changing the code signs bar devices out", () => {
  const sql = read("../supabase/migrations/0040_bar_scanner_access.sql");
  assert.match(sql, /new\.code_version := old\.code_version \+ 1/);
  const src = fn();
  assert.match(src, /k: 'bar'/);
  assert.match(src, /payload\?\.k !== 'bar'/, "a member token must never pass as a bar session");
  assert.match(src, /Number\(payload\.cv\) === Number\(access\.code_version\)/);
});

test("the admin panel has the bar scanner tab and perks show under the member card", () => {
  const panel = read("../src/components/admin/panels/StorePanel.jsx");
  assert.match(panel, /BarScannerAccessManager/);
  assert.match(panel, /label: "Member Perks"/);
  assert.match(read("../src/components/membership/MembershipCard.jsx"), /\{showPerks && <MemberPerks \/>\}/);
});
