// Draft storage for in-progress create/edit forms.
//
// Phones routinely throw the page away while the user is in another app: the
// Android/iOS OS kills a backgrounded WebView to free memory, a mobile browser
// discards the tab, or the PWA auto-updates while hidden. Anything held only in
// React state is gone when the user comes back. Forms that create something
// (store items, ads, sponsors, news, swap listings) save their fields here as
// they are typed and restore them on the next mount.
//
// Pure helpers take a Storage-like object so tests can run without a DOM.

const PREFIX = "rlt_draft:";
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function draftStorageKey(key) {
  return `${PREFIX}${key}`;
}

export function readDraft(key, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !key) return undefined;
  try {
    const raw = storage.getItem(draftStorageKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return undefined;
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(draftStorageKey(key));
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

export function writeDraft(key, value, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !key) return;
  try {
    storage.setItem(draftStorageKey(key), JSON.stringify({ savedAt: now, value }));
  } catch {
    // Quota exceeded / private mode: the in-memory form still works.
  }
}

export function clearDraft(key, { storage = defaultStorage() } = {}) {
  if (!storage || !key) return;
  try {
    storage.removeItem(draftStorageKey(key));
  } catch { /* ignore */ }
}

// Forms currently holding unsaved input. PwaUpdatePrompt checks this before
// silently reloading the page in the background.
const dirtyKeys = new Set();

export function markDraftDirty(key, dirty) {
  if (!key) return;
  if (dirty) dirtyKeys.add(key);
  else dirtyKeys.delete(key);
}

export function hasDirtyDrafts() {
  return dirtyKeys.size > 0;
}
