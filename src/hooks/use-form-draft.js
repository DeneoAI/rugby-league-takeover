import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, markDraftDirty, readDraft, writeDraft } from "@/lib/form-drafts";

const sameJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/**
 * useState that survives the page being thrown away while the user is in
 * another app. The value is restored on mount, saved on every change, and
 * removed once it is back to `emptyValue` (or `discard()` is called after a
 * successful submit / cancel).
 *
 * Pass `key = null` to turn persistence off (behaves like plain useState).
 */
export function useFormDraft(key, emptyValue) {
  const emptyRef = useRef(emptyValue);
  const [value, setValue] = useState(() => {
    const saved = key ? readDraft(key) : undefined;
    return saved === undefined ? emptyValue : saved;
  });

  useEffect(() => {
    if (!key) return;
    const isEmpty = sameJson(value, emptyRef.current);
    if (isEmpty) clearDraft(key);
    else writeDraft(key, value);
    markDraftDirty(key, !isEmpty);
  }, [key, value]);

  useEffect(() => () => { if (key) markDraftDirty(key, false); }, [key]);

  const discard = useCallback(() => {
    if (key) {
      clearDraft(key);
      markDraftDirty(key, false);
    }
    setValue(emptyRef.current);
  }, [key]);

  return [value, setValue, discard];
}
