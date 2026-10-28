# Stadium Swim pool party banner

Banner Top creatives for the Rugby League Takeover pool party at Stadium Swim
(Thursday Feb 25, 1PM–4PM), built to `docs/SPONSOR_BANNER_SPEC.txt`.

Stadium Swim's own artwork was a square 940×788 social flyer
(`source-flyer-940x788.jpg`). The banner slot only shows 8:1 (desktop) and
3.2:1 (mobile) creatives without letterboxing, so these were rebuilt from the
flyer's own pieces: the crest over the pool photo, the date/time, key copy and
the Stadium Swim mark.

| File | Size | Admin settings |
| --- | --- | --- |
| `public/sponsors/stadium-swim/pool-party-desktop-1456x180.png` | 1456×180 | Banner Top · Leaderboard (728 × 90) · Device = Desktop |
| `public/sponsors/stadium-swim/pool-party-mobile-640x200.png` | 640×200 | Banner Top · Large Mobile Banner (320 × 100) · Device = Mobile |

## Rebuilding

`desktop.html` / `mobile.html` are the sources (pixel-exact at 2x, Oswald from
Google Fonts). `pool.png` and `swim.png` are crops of the flyer. Open either
page in Chromium and screenshot the `#banner` element at device scale 1.
