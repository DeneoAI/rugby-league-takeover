// Request a Supabase Storage image at the size it is actually displayed.
//
// Uploads land in storage at whatever size the uploader had. The site logo is
// a 1024x1024 PNG weighing 741 KB and is never shown larger than 320 CSS px —
// so every visitor downloaded about 25x more data than the logo needs. On a
// phone that takes long enough for the browser to paint the PNG top-down as
// bytes arrive, which looks like a logo cut in half.
//
// Supabase's render endpoint resizes on the fly and negotiates WebP from the
// Accept header, so older browsers still get the original format.
const OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

export function sizedImage(url, width) {
  const src = String(url || "");
  // Only Supabase Storage public objects can be transformed. Anything else —
  // a local /icons/ asset, an external URL, a data URI — is returned as-is.
  if (!src.includes(OBJECT_PATH)) return src;
  // A URL that already carries a query is one somebody tuned deliberately
  // (or a cache-buster); leave it alone rather than fight over parameters.
  if (src.includes("?")) return src;
  if (!Number.isFinite(width) || width <= 0) return src;
  return `${src.replace(OBJECT_PATH, RENDER_PATH)}?width=${Math.round(width)}&quality=75`;
}

// One width for the logo everywhere it appears. The nav shows it at 48-56px
// and the hero at up to 320px, but asking for the SAME variant in both places
// means one cached download instead of two.
export const LOGO_WIDTH = 640;
