-- ---------------------------------------------------------------------------
-- 0040 — Bar scanner access: let bar staff check member cards without an
-- RLT account.
--
-- Until now the member check (/verify-member) only worked for signed-in
-- admins and moderators. Bars don't have RLT accounts, so the admin sets ONE
-- 8-digit access code, hands it to the bar, and staff enter it on /scan.
--
-- Design notes:
--   * Single row (id = 'default'). There is one code for all bars today; if
--     per-venue codes are ever wanted, drop the id check and add a venue name.
--   * The code is read and written ONLY by the membershipCard edge function
--     (service role). RLS is enabled with no policies, so neither the browser
--     nor a signed-in admin can read it directly — the admin screen goes
--     through the function, which checks the admin role itself.
--   * code_version bumps whenever the code changes or the scanner is switched
--     off. Bar devices hold a signed session that carries the version they
--     signed in with, so changing the code signs every bar device out.
--   * bar_scanner_attempts throttles guessing: 8 digits is 100 million
--     combinations, which is only safe if nobody can try thousands a minute.
-- ---------------------------------------------------------------------------

create table if not exists public.bar_scanner_access (
  id text primary key default 'default',
  access_code text,
  enabled boolean not null default true,
  code_version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  updated_by text,
  constraint bar_scanner_access_singleton check (id = 'default'),
  constraint bar_scanner_access_code_check check (access_code is null or access_code ~ '^[0-9]{8}$')
);

comment on table public.bar_scanner_access is
  'The 8-digit code bar staff enter on /scan to check member cards. Service-role only; edited from Admin → Store → Bar Scanner.';
comment on column public.bar_scanner_access.code_version is
  'Bumped when the code changes or the scanner is turned off, which signs out every bar device.';

create or replace function public.bar_scanner_access_bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.access_code is distinct from old.access_code
     or (old.enabled and not new.enabled) then
    new.code_version := old.code_version + 1;
  end if;
  new.updated_date := now();
  return new;
end;
$$;

drop trigger if exists bar_scanner_access_bump on public.bar_scanner_access;
create trigger bar_scanner_access_bump
  before update on public.bar_scanner_access
  for each row execute function public.bar_scanner_access_bump_version();

alter table public.bar_scanner_access enable row level security;
-- Deliberately no policies: service role only.

insert into public.bar_scanner_access (id) values ('default')
on conflict (id) do nothing;

create table if not exists public.bar_scanner_attempts (
  id bigserial primary key,
  ip text not null default '',
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists bar_scanner_attempts_ip_time_idx
  on public.bar_scanner_attempts (ip, attempted_at desc);

alter table public.bar_scanner_attempts enable row level security;
-- Deliberately no policies: service role only.
