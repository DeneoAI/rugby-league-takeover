/**
 * Robust in-page anchor scrolling for the home page's lazy-loaded sections.
 *
 * The home page renders each section inside <LazySection>, which shows a short
 * fixed-height placeholder until the section scrolls near the viewport. A plain
 * `element.scrollIntoView({ behavior: "smooth" })` ANIMATES THROUGH those
 * placeholders on the way to a target lower down; as the smooth scroll passes
 * each one it hydrates, its real (much taller) content replaces the placeholder,
 * and the growing layout shoves the target further down — so the animation lands
 * short, parking the user on an earlier section. That is the reported
 * "About Us opens Travel Packages / Events opens Travel Packages" bug.
 *
 * This helper avoids the fly-through entirely: it JUMPS straight to the target
 * (so intermediate sections never hydrate mid-scroll) and then re-pins to the
 * target for a short window, absorbing any reflow from the one or two sections
 * within the lazy pre-load margin above it, until the position holds still.
 *
 * Holding still for a few frames is not enough on its own: a lazy section's
 * code chunk can still be downloading at that point, and when it arrives the
 * section grows and pushes the target down AFTER the loop has stopped. That is
 * why About Us (the deepest menu anchor) kept landing on News/Merch. So the
 * helper also asks every LazySection to hydrate up front (HYDRATE_EVENT), and
 * only counts the position as settled once no section is still a placeholder
 * or a loading fallback ([data-section-loading]) and it has held for
 * STABLE_MS. Any touch, wheel or key from the user stops the re-pin at once.
 *
 * For a target that itself lives inside a lazy section (e.g.
 * "#travel-registration" inside TravelSection), pass `prescroll` with an anchor
 * that is always in the DOM (its wrapper, e.g. "#travel"); the helper jumps
 * there first so the section hydrates and the real target appears.
 */

const DEFAULT_OFFSET = 80; // matches the home section wrappers' scrollMarginTop
const WAIT_FOR_TARGET_MS = 4000; // element may not be mounted yet (route change / lazy)
const SETTLE_BUDGET_MS = 5000; // hard cap on the re-pin loop (slow mobile chunk loads)
const STABLE_MS = 300; // how long the target must hold still to count as "settled"

// LazySection listens for this and renders its real content immediately.
export const HYDRATE_EVENT = "rlt:hydrate-sections";
const LOADING_SELECTOR = "[data-section-loading]";

// index.css sets `scroll-behavior: smooth` on <html>, which turns a bare
// window.scrollTo(x, y) into an animation — the very fly-through this helper
// exists to avoid (it was still sending About Us to News/Merch). Always jump.
function jumpTo(top) {
  window.scrollTo({ top, left: 0, behavior: "instant" });
}

export function scrollToAnchor(hash, { offset = DEFAULT_OFFSET, prescroll = null, updateHistory = true } = {}) {
  if (typeof document === "undefined" || typeof hash !== "string" || !hash.startsWith("#")) return;

  const topFor = (selector) => {
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch {
      return null; // malformed selector — treat as absent
    }
    if (!el) return null;
    return Math.max(0, window.scrollY + el.getBoundingClientRect().top - offset);
  };

  const waitStart = Date.now();
  let settleStart = 0;
  let lastTop = null;
  let stableSince = 0;
  let prescrolled = false;
  let cancelled = false;

  // Hydrate every lazy section now, so the layout above the target converges
  // while we pin instead of growing later underneath the user.
  try {
    window.dispatchEvent(new Event(HYDRATE_EVENT));
  } catch {
    /* Event constructor unavailable — sections still hydrate on intersection */
  }

  // The user taking over (scrolling, tapping, typing) ends the re-pin.
  const userEvents = ["wheel", "touchstart", "keydown"];
  const cancel = () => {
    cancelled = true;
    userEvents.forEach((type) => window.removeEventListener(type, cancel));
  };
  userEvents.forEach((type) => window.addEventListener(type, cancel, { passive: true }));

  const frame = () => {
    if (cancelled) return;
    // While the page is scroll-locked (a mobile nav drawer is still open or
    // closing — it pins the body with position:fixed), any scroll we do here is
    // undone by the drawer's scroll-restore when it closes. That's the "first
    // tap does nothing, second tap works" bug. Wait for the lock to lift, then
    // scroll — so the very first tap lands correctly.
    if (typeof document !== "undefined" && document.body.style.position === "fixed") {
      if (Date.now() - waitStart < WAIT_FOR_TARGET_MS) requestAnimationFrame(frame);
      else cancel();
      return;
    }

    const top = topFor(hash);

    // Target not in the DOM yet (route still mounting, or it lives in a lazy
    // section). Nudge the prescroll anchor into view once so its section
    // hydrates and the real target appears, then keep polling.
    if (top === null) {
      if (prescroll && !prescrolled) {
        const pTop = topFor(prescroll);
        if (pTop !== null) {
          jumpTo(pTop);
          prescrolled = true;
        }
      }
      if (Date.now() - waitStart < WAIT_FOR_TARGET_MS) requestAnimationFrame(frame);
      else cancel();
      return;
    }

    const now = Date.now();
    if (!settleStart) settleStart = now;
    jumpTo(top);

    if (lastTop !== null && Math.abs(top - lastTop) <= 1) {
      if (!stableSince) stableSince = now;
    } else {
      stableSince = 0;
    }
    lastTop = top;

    const stillLoading = document.querySelector(LOADING_SELECTOR) !== null;
    const stable = stableSince && !stillLoading ? now - stableSince : 0;

    // Done once every section has loaded and the computed target has held
    // still, or after a hard time budget as a safety net.
    if (stable >= STABLE_MS || now - settleStart > SETTLE_BUDGET_MS) {
      cancel();
      if (updateHistory) {
        try {
          window.history.replaceState(null, "", `/${hash}`);
        } catch {
          /* history may be unavailable in some embedded contexts */
        }
      }
      return;
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
