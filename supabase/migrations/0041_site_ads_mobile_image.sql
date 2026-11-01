-- 0041: one ad, two creatives — a desktop image and a mobile image.
--
-- image_url stays the desktop creative; mobile_image_url is the phone one.
-- The site shows the mobile image below 768px and the desktop image above it,
-- and falls back to whichever one is set, so either may be left empty
-- (image_url loses its NOT NULL; the admin form still requires one of them).
alter table public.site_ads add column if not exists mobile_image_url text;
alter table public.site_ads alter column image_url drop not null;
alter table public.site_ads drop constraint if exists site_ads_has_image;
alter table public.site_ads add constraint site_ads_has_image
  check (coalesce(image_url, '') <> '' or coalesce(mobile_image_url, '') <> '') not valid;

-- Give the live Stadium Swim pool party banner its sized phone creative
-- (shipped in public/sponsors/stadium-swim/). Until now phones were shown the
-- 1456×180 desktop art squeezed into a 320px strip.
update public.site_ads
   set mobile_image_url = '/sponsors/stadium-swim/pool-party-mobile-640x200.png'
 where position = 'banner-top'
   and title ilike '%stadium swim%'
   and device_target <> 'mobile'
   and coalesce(mobile_image_url, '') = '';
