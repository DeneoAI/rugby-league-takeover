-- 0040: per-article call-to-action button on news articles.
--
-- Every article's detail sheet ended with the same hard-coded "Register Vegas
-- Travel Interest" button. Event and sponsor articles (e.g. the Stadium Swim
-- pool party) need their own button — "Book now" through to the booking page.
-- Both columns are optional: an article without them keeps the default button.
alter table public.news_articles
  add column if not exists cta_label text,
  add column if not exists cta_url text;
