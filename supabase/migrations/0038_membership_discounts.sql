-- ---------------------------------------------------------------------------
-- 0038 — Membership discounts: what an RLT membership actually gets you.
--
-- Until now the perks were hard-coded copy in MembershipTab ("Bar discounts —
-- member pricing on the night"). Nobody could change them without a deploy,
-- and bar staff checking a card had no way to see what discount to apply.
--
-- This table is the admin-managed list. It drives:
--   * the "What you get" list on Account → Membership (members and prospects);
--   * the discount list on the staff /verify-member screen after a valid scan.
--
-- Design notes:
--   * There is one membership tier today, so a discount simply belongs to "the
--     membership". If tiers arrive later, add a tier column here — nothing
--     else about the shape changes.
--   * Visibility is data: is_active plus an optional starts_at/ends_at window,
--     so a one-night special can be loaded ahead of time and expire on its own
--     (no cron in this project — the window is evaluated at read time).
--   * The list is PUBLIC marketing ("join and get 10% off at the bar"), so
--     anyone may read live rows. Admins read and write everything. Do not put
--     secret redemption codes in these rows.
-- ---------------------------------------------------------------------------

create table if not exists public.membership_discounts (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  discount_label text,
  venue text,
  how_to_redeem text,
  sort_order numeric not null default 1,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  constraint membership_discounts_title_check check (length(trim(title)) between 1 and 120),
  constraint membership_discounts_window_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on table public.membership_discounts is
  'Admin-managed perks/discounts included with an RLT membership. Public read of live rows; admin-only write.';
comment on column public.membership_discounts.discount_label is
  'Short headline value shown as a badge, e.g. "10% off", "$5 pints", "Free entry".';
comment on column public.membership_discounts.how_to_redeem is
  'Instruction for the member/staff, e.g. "Show your member QR at the bar". Public — never a secret code.';

create index if not exists membership_discounts_sort_idx
  on public.membership_discounts (sort_order);

drop trigger if exists membership_discounts_touch_updated on public.membership_discounts;
create trigger membership_discounts_touch_updated
  before update on public.membership_discounts
  for each row execute function public.touch_updated_date();

alter table public.membership_discounts enable row level security;

drop policy if exists "membership_discounts_read" on public.membership_discounts;
create policy "membership_discounts_read" on public.membership_discounts for select
  using (
    public.is_admin()
    or (
      is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    )
  );

drop policy if exists "membership_discounts_admin_write" on public.membership_discounts;
create policy "membership_discounts_admin_write" on public.membership_discounts for all
  using (public.is_admin()) with check (public.is_admin());

-- Seed the perk the app has been promising all along, so the member screen
-- never goes blank the moment this ships. Admins edit or remove it from there.
insert into public.membership_discounts (title, description, discount_label, how_to_redeem, sort_order)
select
  'Bar discounts',
  'Member pricing at the bar on RLT nights.',
  'Member pricing',
  'Show your member QR code at the bar when you order.',
  1
where not exists (select 1 from public.membership_discounts);
