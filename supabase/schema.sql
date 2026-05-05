create extension if not exists pgcrypto;

create table if not exists coupon_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text not null,
  coupon_selector text,
  coupon_regex text,
  active boolean not null default true,
  last_seen_coupon text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  udemy_url text not null,
  instructor_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references coupon_sources(id) on delete cascade,
  code text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_url text,
  raw_context text,
  is_active boolean not null default true,
  unique (source_id, code)
);

create table if not exists checks (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  error_message text
);

create table if not exists course_check_results (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  coupon_id uuid references coupons(id) on delete set null,
  coupon_code text,
  status text not null,
  final_price numeric,
  currency text,
  detected_label text,
  udemy_checked_url text,
  error_message text,
  checked_at timestamptz not null default now()
);

create index if not exists course_check_results_course_checked_idx
  on course_check_results(course_id, checked_at desc);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  coupon_id uuid references coupons(id) on delete cascade,
  alert_type text not null,
  dedupe_key text not null unique,
  sent_to text,
  sent_at timestamptz not null default now(),
  message text not null
);

create table if not exists review_locks (
  lock_name text primary key,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checks'
  ) then
    alter publication supabase_realtime add table public.checks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'course_check_results'
  ) then
    alter publication supabase_realtime add table public.course_check_results;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coupon_sources'
  ) then
    alter publication supabase_realtime add table public.coupon_sources;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses'
  ) then
    alter publication supabase_realtime add table public.courses;
  end if;
end $$;
