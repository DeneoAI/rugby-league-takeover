-- 0039: let site_ads store the Large Mobile Banner size.
--
-- The admin Ads form offers "Large Mobile Banner (320 × 100)" — the size the
-- sponsor banner spec tells admins to pick for the mobile Banner Top creative —
-- but the original check constraint predates it, so saving such an ad failed.
-- (0038 is taken by the membership discounts migration on another branch.)
alter table public.site_ads drop constraint if exists site_ads_size_check;
alter table public.site_ads add constraint site_ads_size_check
  check (size in ('leaderboard', 'medium-rectangle', 'wide-skyscraper', 'mobile-banner', 'large-mobile-banner'));
