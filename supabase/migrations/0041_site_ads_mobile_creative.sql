-- 0041: one ad, two creatives.
--
-- A Banner Top sponsor needs two artworks — a 728×90 desktop leaderboard and a
-- 320×100 mobile strip — because the slot changes shape at 768px. Until now the
-- only way to do that was TWO ad records paired by device_target, which
-- duplicated the title, click-through URL, schedule and rate, and split the
-- impression/click counts across two rows so neither told the sponsor the truth.
--
-- image_url_mobile is optional: an ad with only image_url behaves exactly as
-- before, and the device_target pairing still works for anyone already using it.
alter table public.site_ads add column if not exists image_url_mobile text;

comment on column public.site_ads.image_url_mobile is
  'Optional phone creative. Used when the slot resolves to a mobile banner preset; falls back to image_url.';
