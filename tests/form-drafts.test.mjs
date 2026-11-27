import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DRAFT_TTL_MS,
  clearDraft,
  draftStorageKey,
  hasDirtyDrafts,
  markDraftDirty,
  readDraft,
  writeDraft,
} from "../src/lib/form-drafts.js";

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
};

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a saved draft comes back after the page is thrown away", () => {
  const storage = memoryStorage();
  writeDraft("admin:ad", { title: "Pool party", target_url: "https://x" }, { storage, now: 1000 });
  assert.deepEqual(readDraft("admin:ad", { storage, now: 2000 }), { title: "Pool party", target_url: "https://x" });
});

test("expired, cleared, corrupt or missing drafts read as nothing", () => {
  const storage = memoryStorage();
  writeDraft("k", { a: 1 }, { storage, now: 0 });
  assert.equal(readDraft("k", { storage, now: DRAFT_TTL_MS + 1 }), undefined);
  assert.equal(storage.getItem(draftStorageKey("k")), null, "expired draft is removed");

  writeDraft("k", { a: 1 }, { storage, now: 0 });
  clearDraft("k", { storage });
  assert.equal(readDraft("k", { storage, now: 1 }), undefined);

  storage.setItem(draftStorageKey("bad"), "{not json");
  assert.equal(readDraft("bad", { storage }), undefined);
  assert.equal(readDraft("never", { storage }), undefined);
  assert.equal(readDraft("k", { storage: null }), undefined);
});

test("storage that throws (quota, private mode) never breaks the form", () => {
  const storage = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.doesNotThrow(() => writeDraft("k", { a: 1 }, { storage }));
  assert.doesNotThrow(() => clearDraft("k", { storage }));
  assert.equal(readDraft("k", { storage }), undefined);
});

test("dirty-draft registry tracks forms with unsaved input", () => {
  assert.equal(hasDirtyDrafts(), false);
  markDraftDirty("a", true);
  markDraftDirty("b", true);
  markDraftDirty("a", false);
  assert.equal(hasDirtyDrafts(), true);
  markDraftDirty("b", false);
  assert.equal(hasDirtyDrafts(), false);
});

test("returning to the app does not unmount signed-in pages", () => {
  // Supabase re-emits SIGNED_IN on every visibilitychange. For a signed-in
  // user that must take the silent path, not the loader-flipping one.
  const auth = read("src/lib/AuthContext.jsx");
  assert.match(auth, /refreshUserSilently/);
  assert.match(auth, /if \(signedInRef\.current\) refreshUserSilently\(\);/);
  const silent = auth.slice(auth.indexOf("const refreshUserSilently"), auth.indexOf("const checkAppState"));
  assert.doesNotMatch(silent, /setIsLoadingAuth|setIsAuthenticated\(false\)|setUser\(null\)/);

  for (const guard of ["src/components/RequireAuth.jsx", "src/components/RequireAdmin.jsx", "src/components/ProtectedRoute.jsx"]) {
    assert.match(read(guard), /isLoadingAuth && !isAuthenticated/, `${guard} keeps the page mounted while re-checking`);
  }
});

test("create forms persist their input", () => {
  for (const [file, key] of [
    ["src/components/admin/AdsManager.jsx", "admin:ad"],
    ["src/components/admin/SponsorManager.jsx", "admin:sponsor"],
    ["src/components/admin/ProductsManager.jsx", "admin:product:new"],
    ["src/components/admin/NewsManager.jsx", "admin:news:new"],
    ["src/pages/SwapBoard.jsx", "swap:new"],
  ]) {
    assert.match(read(file), new RegExp(`useFormDraft\\("${key}"`), `${file} uses a form draft`);
  }
  assert.match(read("src/components/PwaUpdatePrompt.jsx"), /!hasDirtyDrafts\(\)/);
  assert.doesNotMatch(read("src/pages/Forum.jsx"), /setTimeout\(\(\) => \{\s*try \{ localStorage\.setItem\(DRAFT_STORAGE_KEY/);
});
