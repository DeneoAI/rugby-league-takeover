// RLT membership — shared client logic.
//
// Membership is a TIME-BOUNDED entitlement: the expiry timestamp is the truth
// and is evaluated whenever it's read. There is no nightly job flipping people
// to expired, so nothing here may cache an "is member" answer.

export const MEMBERSHIP_TERM_MONTHS = 12;

// Show the renewal nudge inside the last stretch of the term.
export const RENEWAL_WINDOW_DAYS = 30;

export function membershipExpiry(user) {
  const raw = user?.membership_expires_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isActiveMember(user, now = Date.now()) {
  const expiry = membershipExpiry(user);
  return !!expiry && expiry.getTime() > now;
}

// A lapsed member is someone who HAD a membership — worth a different message
// from someone who never joined.
export function hasLapsed(user, now = Date.now()) {
  const expiry = membershipExpiry(user);
  return !!expiry && expiry.getTime() <= now;
}

export function daysRemaining(user, now = Date.now()) {
  const expiry = membershipExpiry(user);
  if (!expiry) return null;
  return Math.ceil((expiry.getTime() - now) / 86400000);
}

export function isExpiringSoon(user, now = Date.now()) {
  const days = daysRemaining(user, now);
  return days != null && days > 0 && days <= RENEWAL_WINDOW_DAYS;
}

export function formatMembershipDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// One sentence describing where the member stands, for the card and Account.
export function membershipStatusLine(user, now = Date.now()) {
  if (isActiveMember(user, now)) {
    const days = daysRemaining(user, now);
    if (days <= RENEWAL_WINDOW_DAYS) {
      return `Expires in ${days} day${days === 1 ? "" : "s"} — renew to keep your benefits`;
    }
    return `Valid until ${formatMembershipDate(user.membership_expires_at)}`;
  }
  if (hasLapsed(user, now)) {
    return `Expired ${formatMembershipDate(user.membership_expires_at)} — renew to reactivate`;
  }
  return "Not a member yet";
}

// ── Membership discounts ────────────────────────────────────────────────────
// Admin-managed perks (migration 0038). RLS already hides inactive/out-of-window
// rows from non-admins, but admins read every row — so the member-facing views
// filter again here rather than trusting who happens to be looking.

export function discountIsLive(discount, now = Date.now()) {
  if (!discount || discount.is_active === false) return false;
  const start = discount.starts_at ? new Date(discount.starts_at).getTime() : null;
  const end = discount.ends_at ? new Date(discount.ends_at).getTime() : null;
  if (start != null && !Number.isNaN(start) && start > now) return false;
  if (end != null && !Number.isNaN(end) && end <= now) return false;
  return true;
}

export function sortDiscounts(discounts = []) {
  return [...discounts].sort(
    (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || String(a.title || "").localeCompare(String(b.title || ""))
  );
}

export function liveDiscounts(discounts = [], now = Date.now()) {
  return sortDiscounts(discounts.filter((d) => discountIsLive(d, now)));
}

// Admin list label: why a row is or isn't showing to members right now.
export function discountStatus(discount, now = Date.now()) {
  if (discount?.is_active === false) return "hidden";
  const start = discount?.starts_at ? new Date(discount.starts_at).getTime() : null;
  if (start != null && start > now) return "scheduled";
  const end = discount?.ends_at ? new Date(discount.ends_at).getTime() : null;
  if (end != null && end <= now) return "ended";
  return "live";
}
