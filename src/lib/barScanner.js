// Bar scanner (/scan) — shared client logic.
//
// Bar staff sign in with the admin-set 8-digit code and get back a signed
// "bar session" from the membershipCard function. The session lives in this
// browser only; the server re-checks it on every scan, so changing the code in
// the admin panel signs every bar device out.

export const BAR_SESSION_KEY = "rlt.barScannerSession";

export const isBarAccessCode = (value) => /^[0-9]{8}$/.test(String(value ?? "").trim());

// Keep only digits, max 8, so a pasted "1234 5678" still works.
export const normaliseBarCode = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 8);

// Member numbers look like RLT-001234. Staff often type "rlt 1234" or "1234".
export function normaliseMemberNumber(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const digits = raw.replace(/^RLT[\s-]*/, "");
  if (/^[0-9]{1,6}$/.test(digits)) return `RLT-${digits.padStart(6, "0")}`;
  return raw;
}

// What did the camera just read? The member card QR is a URL to /scan (or the
// older /verify-member) carrying ?t=<signed token>. Accept a bare token or a
// printed member number too, so a different QR generator still works.
export function parseScannedCode(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const token = url.searchParams.get("t");
      if (token) return { token };
    } catch {
      /* fall through */
    }
    return null;
  }
  if (/^RLT[\s-]*[0-9]{1,6}$/i.test(raw)) return { number: normaliseMemberNumber(raw) };
  // Signed card token: base64url body "." base64url signature.
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}$/.test(raw)) return { token: raw };
  return null;
}

export function readBarSession(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage?.getItem(BAR_SESSION_KEY) || "null");
    if (!parsed?.session || !parsed?.expires_at) return null;
    if (new Date(parsed.expires_at).getTime() <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBarSession(session, expiresInSeconds, storage = globalThis.localStorage, now = Date.now()) {
  const record = {
    session,
    expires_at: new Date(now + Number(expiresInSeconds || 0) * 1000).toISOString(),
  };
  try {
    storage?.setItem(BAR_SESSION_KEY, JSON.stringify(record));
  } catch {
    /* private mode: works for this page load only */
  }
  return record;
}

export function clearBarSession(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(BAR_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
