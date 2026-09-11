-- SmartManager Loyalty — Supabase schema
-- Run once in Supabase: SQL Editor > New query > paste this file > Run.
--
-- Multi-tenant model: every business (clinic/salon/gym/etc.) using the
-- product is a row in `businesses`. Every other table carries a
-- `business_id` and is locked down with Row Level Security so a business
-- only ever sees its own data. Membership + role live in `business_users`.

create extension if not exists "pgcrypto";
-- Kept out of the public schema per Supabase's linter guidance; used below
-- for the bookings table's double-booking-prevention exclusion constraint.
create schema if not exists extensions;
create extension if not exists "btree_gist" schema extensions;

-- ── Tenancy ──────────────────────────────────────────────────────────────

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null default 'other'
    check (business_type in (
      'clinic','dental','physiotherapy','dermatology','aesthetic_clinic','laser_clinic',
      'beauty_salon','spa','gym','barber','car_service','training_center','consultant','other'
    )),
  -- what a "visit" is called in this business's UI (Appointment/Session/Service/Purchase/Visit)
  visit_label text not null default 'Visit',
  default_language text not null default 'en' check (default_language in ('en','ar')),
  currency text not null default 'SAR',
  timezone text not null default 'Asia/Riyadh',
  -- Billing data model only — no payment processor is wired up yet (see
  -- README "Billing"). Every business starts on a 14-day trial; nothing
  -- here ever charges a card.
  subscription_plan text not null default 'trial'
    check (subscription_plan in ('trial','starter','growth','professional','enterprise')),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

do $$ begin
  create type business_role as enum ('owner','admin','manager','staff');
exception when duplicate_object then null; end $$;

create table if not exists business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role business_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

-- security-definer helpers so RLS policies on business_users don't recurse
-- into themselves, and other tables can cheaply check membership/role.
create or replace function is_business_member(biz uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from business_users where business_id = biz and user_id = auth.uid()
  );
$$;

create or replace function business_role_of(biz uuid)
returns business_role language sql stable security definer set search_path = public as $$
  select role from business_users where business_id = biz and user_id = auth.uid() limit 1;
$$;

-- Onboarding entry point: creates a business, makes the calling user its
-- Owner, and seeds sensible default segmentation/VIP rules — all in one
-- transaction so RLS never has to allow a bare insert into `businesses`.
create or replace function create_business(
  p_name text,
  p_business_type text default 'other',
  p_visit_label text default 'Visit',
  p_language text default 'en',
  p_currency text default 'SAR'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into businesses (name, business_type, visit_label, default_language, currency)
  values (p_name, p_business_type, p_visit_label, p_language, p_currency)
  returning id into new_id;

  insert into business_users (business_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  insert into segmentation_rules (business_id, segment_key, rule_config) values
    (new_id, 'new',        '{"days": 14}'),
    (new_id, 'active',     '{"days": 30}'),
    (new_id, 'due',        '{"days_before": 5}'),
    (new_id, 'inactive',   '{"days": 30}'),
    (new_id, 'lost',       '{"days": 90}'),
    (new_id, 'vip',        '{"min_spending": 3000, "min_visits": 10}'),
    (new_id, 'high_value', '{"min_lifetime_value": 2000}'),
    (new_id, 'frequent',   '{"min_visits_per_90d": 3}'),
    (new_id, 'at_risk',    '{"overdue_ratio": 1.3}');

  insert into vip_tiers (business_id, tier_name, criteria, sort_order) values
    (new_id, 'VIP',      '{"min_spending": 3000}',  1),
    (new_id, 'Gold',     '{"min_spending": 8000}',  2),
    (new_id, 'Platinum', '{"min_spending": 20000}', 3);

  return new_id;
end;
$$;

-- ── Team management ──────────────────────────────────────────────────────
-- Inviting a teammate by email needs a security-definer path: the anon-key
-- client can't query auth.users directly (by design), so these functions
-- do the lookup with elevated privileges on the app's behalf.

create table if not exists business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role business_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table business_invites enable row level security;
create policy "owner/admin can manage invites" on business_invites
  for all using (business_role_of(business_id) in ('owner','admin'))
  with check (business_role_of(business_id) in ('owner','admin'));

-- Owner/Admin calls this to add a teammate. If that email already has an
-- account, they're added to business_users immediately; otherwise the
-- invite waits in business_invites until they sign up and claim it.
create or replace function invite_member(p_business_id uuid, p_email text, p_role business_role default 'staff')
returns void language plpgsql security definer set search_path = public as $$
declare
  target_user_id uuid;
begin
  if business_role_of(p_business_id) not in ('owner','admin') then
    raise exception 'not authorized';
  end if;

  select id into target_user_id from auth.users where lower(email) = lower(p_email) limit 1;

  if target_user_id is not null then
    insert into business_users (business_id, user_id, role)
    values (p_business_id, target_user_id, p_role)
    on conflict (business_id, user_id) do update set role = excluded.role;
    delete from business_invites where business_id = p_business_id and lower(email) = lower(p_email);
  else
    insert into business_invites (business_id, email, role)
    values (p_business_id, lower(p_email), p_role)
    on conflict (business_id, email) do update set role = excluded.role;
  end if;
end;
$$;

-- Called once after sign-in: joins the caller to every business that
-- invited their email address, then clears those invites.
create or replace function claim_invites()
returns void language plpgsql security definer set search_path = public as $$
declare
  my_email text;
  inv record;
begin
  if auth.uid() is null then return; end if;
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then return; end if;

  for inv in select * from business_invites where lower(email) = lower(my_email) loop
    insert into business_users (business_id, user_id, role)
    values (inv.business_id, auth.uid(), inv.role)
    on conflict (business_id, user_id) do nothing;
    delete from business_invites where id = inv.id;
  end loop;
end;
$$;

-- Team page needs member emails, which live in auth.users — this exposes
-- just email+role+join date, and only to fellow members of that business.
create or replace function list_business_members(p_business_id uuid)
returns table(user_id uuid, email text, role business_role, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select bu.user_id, u.email, bu.role, bu.created_at
  from business_users bu
  join auth.users u on u.id = bu.user_id
  where bu.business_id = p_business_id and is_business_member(p_business_id);
$$;

-- ── Customers ────────────────────────────────────────────────────────────

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  customer_since date not null default current_date,
  notes text,
  -- rollups from a spreadsheet import that predates any logged visit rows;
  -- see customer_stats below for how these blend with real visit history.
  import_total_visits int,
  import_total_spending numeric,
  import_last_visit_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_business_idx on customers(business_id);

create table if not exists customer_visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  visit_date date not null default current_date,
  amount numeric not null default 0,
  service text,
  source text not null default 'manual' check (source in ('manual','import','booking')),
  created_at timestamptz not null default now()
);
create index if not exists customer_visits_business_idx on customer_visits(business_id);
create index if not exists customer_visits_customer_idx on customer_visits(customer_id);

-- Every view below sets security_invoker = true on purpose: without it, a
-- view runs with its OWNER's privileges (a superuser, who bypasses RLS),
-- which would leak every business's data to every querying user regardless
-- of business_users membership. This is the one easy way to silently
-- defeat the multi-tenant isolation this whole schema is built on — don't
-- drop it when editing these views.

-- Per-customer aggregates, blending real visit rows with import rollups
-- (GREATEST so a business that later logs granular visits doesn't lose the
-- history it imported on day one).
create or replace view customer_stats
with (security_invoker = true) as
select
  c.id as customer_id,
  c.business_id,
  greatest(count(v.id), coalesce(c.import_total_visits, 0)) as total_visits,
  greatest(coalesce(sum(v.amount), 0), coalesce(c.import_total_spending, 0)) as total_spending,
  case when greatest(count(v.id), coalesce(c.import_total_visits, 0)) > 0
    then greatest(coalesce(sum(v.amount), 0), coalesce(c.import_total_spending, 0))
         / greatest(count(v.id), coalesce(c.import_total_visits, 0))
    else 0
  end as avg_transaction,
  greatest(max(v.visit_date), c.import_last_visit_date) as last_visit_date,
  min(v.visit_date) as first_visit_date,
  case
    when count(v.id) > 1 then (max(v.visit_date) - min(v.visit_date))::numeric / (count(v.id) - 1)
    when coalesce(c.import_total_visits, 0) > 1 and c.import_last_visit_date is not null
      then (c.import_last_visit_date - c.customer_since)::numeric / (c.import_total_visits - 1)
    else null
  end as avg_return_cycle_days,
  case when greatest(max(v.visit_date), c.import_last_visit_date) is not null
    then current_date - greatest(max(v.visit_date), c.import_last_visit_date)
    else null
  end as days_since_last_visit
from customers c
left join customer_visits v on v.customer_id = c.id
group by c.id, c.business_id;

-- ── Segmentation (configurable per business, transparent rule-based) ──────

create table if not exists segmentation_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  segment_key text not null check (segment_key in
    ('new','active','due','inactive','lost','vip','high_value','frequent','at_risk')),
  rule_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, segment_key)
);

-- Boolean flag per segment per customer, evaluated against that business's
-- own configurable thresholds. A customer can carry several flags at once
-- (e.g. VIP + Active) — the app picks a single "primary" badge from these
-- by priority (see src/lib/segmentation.js), the raw flags stay available
-- for filtering/counts.
create or replace view customer_segment_flags
with (security_invoker = true) as
with rules as (
  select business_id, jsonb_object_agg(segment_key, rule_config) as cfg
  from segmentation_rules
  where enabled
  group by business_id
)
select
  cs.customer_id,
  cs.business_id,
  cs.total_visits,
  cs.total_spending,
  cs.avg_transaction,
  cs.last_visit_date,
  cs.avg_return_cycle_days,
  cs.days_since_last_visit,
  c.customer_since,
  (current_date - c.customer_since) <= coalesce((r.cfg->'new'->>'days')::int, 14)
    as is_new,
  (cs.days_since_last_visit is not null
    and cs.days_since_last_visit <= coalesce((r.cfg->'active'->>'days')::int, 30))
    as is_active,
  (cs.days_since_last_visit is not null and cs.avg_return_cycle_days is not null
    and cs.days_since_last_visit
      between (cs.avg_return_cycle_days - coalesce((r.cfg->'due'->>'days_before')::int, 5))
      and cs.avg_return_cycle_days)
    as is_due,
  (cs.days_since_last_visit is not null
    and cs.days_since_last_visit > coalesce((r.cfg->'inactive'->>'days')::int, 30)
    and cs.days_since_last_visit <= coalesce((r.cfg->'lost'->>'days')::int, 90))
    as is_inactive,
  (cs.days_since_last_visit is not null
    and cs.days_since_last_visit > coalesce((r.cfg->'lost'->>'days')::int, 90))
    as is_lost,
  (cs.total_spending >= coalesce((r.cfg->'vip'->>'min_spending')::numeric, 1e18)
    or cs.total_visits >= coalesce((r.cfg->'vip'->>'min_visits')::int, 2000000000))
    as is_vip,
  (cs.total_spending >= coalesce((r.cfg->'high_value'->>'min_lifetime_value')::numeric, 1e18))
    as is_high_value,
  (cs.avg_return_cycle_days is not null and cs.avg_return_cycle_days > 0
    and (90.0 / cs.avg_return_cycle_days) >= coalesce((r.cfg->'frequent'->>'min_visits_per_90d')::numeric, 1e9))
    as is_frequent,
  (cs.avg_return_cycle_days is not null and cs.days_since_last_visit is not null
    and cs.days_since_last_visit > cs.avg_return_cycle_days * coalesce((r.cfg->'at_risk'->>'overdue_ratio')::numeric, 1.3)
    and cs.days_since_last_visit <= coalesce((r.cfg->'lost'->>'days')::int, 90))
    as is_at_risk
from customer_stats cs
join customers c on c.id = cs.customer_id
left join rules r on r.business_id = cs.business_id;

-- Convenience view: customer identity fields + every stat/flag in one row,
-- so the app rarely needs more than one query to render a list or profile.
create or replace view customer_overview
with (security_invoker = true) as
select c.name, c.phone, c.email, c.notes, f.*
from customer_segment_flags f
join customers c on c.id = f.customer_id;

-- ── Recovery (leads who inquired but never converted) ──────────────────────

create table if not exists recovery_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  name text not null,
  phone text,
  source text,
  interested_service text,
  inquiry_date date not null default current_date,
  last_contact_date date,
  estimated_value numeric default 0,
  status text not null default 'New'
    check (status in ('New','Contacted','Interested','Follow-up Required','Converted','Lost')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists recovery_business_idx on recovery_opportunities(business_id);

-- ── Rewards ──────────────────────────────────────────────────────────────

create table if not exists reward_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type text not null check (type in ('points','visits','spending')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists customer_rewards (
  customer_id uuid primary key references customers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  points_balance numeric not null default 0,
  lifetime_points numeric not null default 0,
  redeemed_points numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  program_id uuid references reward_programs(id) on delete set null,
  points_used numeric default 0,
  reward_description text,
  redeemed_at timestamptz not null default now()
);

-- ── VIP ──────────────────────────────────────────────────────────────────

create table if not exists vip_tiers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  tier_name text not null,
  criteria jsonb not null default '{}'::jsonb,
  sort_order int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists customer_vip_status (
  customer_id uuid primary key references customers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  tier_id uuid references vip_tiers(id) on delete set null,
  since date not null default current_date
);

-- ── Smart Offers ─────────────────────────────────────────────────────────

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  trigger_segment text check (trigger_segment in
    ('new','active','due','inactive','lost','vip','high_value','frequent','at_risk')),
  offer_type text,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists offer_recommendations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  offer_id uuid references offers(id) on delete set null,
  reason_text text,
  recommended_at timestamptz not null default now(),
  action_taken text not null default 'pending' check (action_taken in ('pending','sent','ignored','converted'))
);

-- ── Services / Products ─────────────────────────────────────────────────
-- The services or products a business sells — a simple reference catalog
-- managed from Settings. Not wired into visit logging yet (that field
-- stays free text); this is the seam for that later.

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric,
  -- default length of a booking for this service, in minutes
  duration_minutes int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists services_business_idx on services(business_id);

-- ── Staff ────────────────────────────────────────────────────────────────

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists staff_business_idx on staff(business_id);

alter table staff enable row level security;
create policy "members read/write staff" on staff
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- ── Bookings ─────────────────────────────────────────────────────────────
-- Real double-booking prevention lives at the database level (an exclusion
-- constraint), not just in application code — it holds even under
-- concurrent requests. A cancelled/no-show booking frees its slot (the
-- partial WHERE clause excludes those statuses from the overlap check).

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled','no_show')),
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists bookings_business_idx on bookings(business_id);
create index if not exists bookings_staff_idx on bookings(staff_id);
create index if not exists bookings_customer_idx on bookings(customer_id);
create index if not exists bookings_start_idx on bookings(business_id, start_at);

alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (staff_id is not null and status not in ('cancelled','no_show'));

alter table bookings enable row level security;
create policy "members read/write bookings" on bookings
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- ── Membership plans ────────────────────────────────────────────────────
-- What a business sells as a package: N sessions (or unlimited) for a
-- fixed price, optionally scoped to one service, optionally expiring after
-- a fixed number of days from purchase.

create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null default 0,
  total_sessions int,              -- null = unlimited
  validity_days int,               -- null = never expires
  service_id uuid references services(id) on delete set null,  -- null = any service
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists membership_plans_business_idx on membership_plans(business_id);

alter table membership_plans enable row level security;
create policy "members read/write membership_plans" on membership_plans
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- ── Customer memberships ────────────────────────────────────────────────
-- A customer's purchase of a plan. Plan fields are snapshotted here (not
-- just plan_id) so editing or deleting a plan later never rewrites history
-- for memberships already sold.

create table if not exists customer_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  plan_id uuid references membership_plans(id) on delete set null,
  plan_name text not null,
  total_sessions int,
  sessions_used int not null default 0,
  price_paid numeric not null default 0,
  starts_at date not null default current_date,
  expires_at date,
  status text not null default 'active' check (status in ('active','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customer_memberships_business_idx on customer_memberships(business_id);
create index if not exists customer_memberships_customer_idx on customer_memberships(customer_id);

alter table customer_memberships enable row level security;
create policy "members read/write customer_memberships" on customer_memberships
  for all using (is_business_member(business_id)) with check (is_business_member(business_id));

-- ── Booking → Loyalty integration ───────────────────────────────────────
-- The entire segmentation/NBA/dashboard engine already reads from
-- customer_visits (see customer_stats / customer_segment_flags above) — so
-- a completed booking only needs to insert a normal visit row and
-- everything downstream recalculates automatically, with zero changes to
-- the existing engine. This RPC is the one and only place that happens,
-- and it's idempotent (completing an already-completed booking is a
-- no-op) so the UI can safely call it without double-inserting visits.

-- A booking can optionally be taken against a specific membership; on
-- completion, complete_booking() deducts one session instead of (or
-- alongside) logging a charge. Declared here (after customer_memberships
-- exists) rather than inline on the bookings table above.
alter table bookings add column if not exists membership_id uuid references customer_memberships(id) on delete set null;
create index if not exists bookings_membership_idx on bookings(membership_id);

-- expired/completed/expiring-soon/unused are derived, not stored, so they
-- never go stale — same approach as customer_segment_flags.
create or replace view customer_memberships_overview
with (security_invoker = true) as
select
  cm.*,
  c.name as customer_name,
  c.phone as customer_phone,
  case when cm.total_sessions is not null then greatest(cm.total_sessions - cm.sessions_used, 0) else null end as sessions_remaining,
  (cm.status = 'active' and cm.expires_at is not null and cm.expires_at < current_date) as is_expired,
  (cm.status = 'active' and cm.total_sessions is not null and cm.sessions_used >= cm.total_sessions) as is_completed,
  (cm.status = 'active' and cm.expires_at is not null and cm.expires_at >= current_date and cm.expires_at <= current_date + 7) as is_expiring_soon,
  (cm.status = 'active' and cm.sessions_used = 0 and cm.created_at <= now() - interval '14 days') as is_unused
from customer_memberships cm
join customers c on c.id = cm.customer_id;

create or replace function complete_booking(p_booking_id uuid, p_amount numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  svc_name text;
  mem record;
begin
  select * into b from bookings where id = p_booking_id;
  if b is null then
    raise exception 'booking not found';
  end if;
  if not is_business_member(b.business_id) then
    raise exception 'not authorized';
  end if;
  if b.status = 'completed' then
    return;
  end if;

  if b.membership_id is not null then
    select * into mem from customer_memberships where id = b.membership_id and business_id = b.business_id;
    if mem is null then
      raise exception 'membership not found';
    end if;
    if mem.status <> 'active' then
      raise exception 'membership is not active';
    end if;
    if mem.expires_at is not null and mem.expires_at < current_date then
      raise exception 'membership has expired';
    end if;
    if mem.total_sessions is not null and mem.sessions_used >= mem.total_sessions then
      raise exception 'membership has no sessions remaining';
    end if;

    update customer_memberships set sessions_used = sessions_used + 1 where id = mem.id;
  end if;

  update bookings set status = 'completed' where id = p_booking_id;

  if b.customer_id is not null then
    select name into svc_name from services where id = b.service_id;
    insert into customer_visits (business_id, customer_id, visit_date, amount, service, source)
    values (b.business_id, b.customer_id, b.start_at::date, coalesce(p_amount, 0), svc_name, 'booking');
  end if;
end;
$$;

-- ── Revenue analytics ────────────────────────────────────────────────────

create table if not exists revenue_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  event_type text not null check (event_type in
    ('recovered','reactivated','repeat_purchase','reward_redeemed','vip_revenue')),
  amount numeric not null default 0,
  related_recovery_id uuid references recovery_opportunities(id) on delete set null,
  related_offer_id uuid references offers(id) on delete set null,
  occurred_at timestamptz not null default now(),
  notes text
);
create index if not exists revenue_events_business_idx on revenue_events(business_id);

-- ── Row Level Security ───────────────────────────────────────────────────
-- Every table is scoped to businesses the signed-in user belongs to.

alter table businesses enable row level security;
create policy "members can view their business" on businesses
  for select using (is_business_member(id));
create policy "owner/admin can update their business" on businesses
  for update using (business_role_of(id) in ('owner','admin'));
-- no insert policy on purpose: businesses are only ever created via the
-- create_business() function above, which runs as security definer.

alter table business_users enable row level security;
create policy "members can view their business's members" on business_users
  for select using (is_business_member(business_id));
create policy "owner/admin can manage members" on business_users
  for insert with check (business_role_of(business_id) in ('owner','admin'));
create policy "owner/admin can update members" on business_users
  for update using (business_role_of(business_id) in ('owner','admin'));
create policy "owner/admin can remove members" on business_users
  for delete using (business_role_of(business_id) in ('owner','admin'));

-- Shared pattern for every operational table: any member of the business
-- can read and write. (Finer-grained role gating, e.g. "staff can't delete",
-- can be layered on later without a schema change.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers','customer_visits','segmentation_rules','recovery_opportunities',
    'reward_programs','customer_rewards','reward_redemptions',
    'vip_tiers','customer_vip_status','offers','offer_recommendations','revenue_events','services'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "members read/write %1$s" on %1$I for all using (is_business_member(business_id)) with check (is_business_member(business_id))',
      t
    );
  end loop;
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table customer_visits;
alter publication supabase_realtime add table recovery_opportunities;
alter publication supabase_realtime add table reward_redemptions;
alter publication supabase_realtime add table offers;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table staff;
alter publication supabase_realtime add table membership_plans;
alter publication supabase_realtime add table customer_memberships;

-- ── Platform Admin ──────────────────────────────────────────────────────
-- Separate from business_users entirely: a platform admin is a person who
-- runs SmartManager Loyalty itself, not a member of any tenant business.
-- Every admin capability below is gated through is_platform_admin() inside
-- a security-definer function — no tenant table's RLS is touched by this
-- section, so existing tenant isolation is unaffected.

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

alter table platform_admins enable row level security;
-- No insert/update/delete policy on purpose: platform admins are managed
-- directly via SQL (or a future admin_add_admin() function), never through
-- a client-writable policy — this is the one table where even an existing
-- admin shouldn't be able to self-service through RLS alone.
create policy "platform admins can view the admin list" on platform_admins
  for select using (is_platform_admin());

-- ── Plans ────────────────────────────────────────────────────────────────
-- Real plan definitions the tenant-facing Billing page reads from, and
-- platform admins manage here. Pricing is platform-level (one currency),
-- distinct from a business's own operating currency.

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('trial','starter','growth','professional','enterprise')),
  name text not null,
  price_monthly numeric,
  price_yearly numeric,
  currency text not null default 'USD',
  max_customers int,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plans enable row level security;
-- Any signed-in user can read active plans (the tenant Billing page needs
-- this); platform admins can read/write everything, active or not.
create policy "authenticated users can read active plans" on plans
  for select using (is_active or is_platform_admin());
create policy "platform admins manage plans" on plans
  for insert with check (is_platform_admin());
create policy "platform admins update plans" on plans
  for update using (is_platform_admin());
create policy "platform admins delete plans" on plans
  for delete using (is_platform_admin());

insert into plans (key, name, price_monthly, price_yearly, currency, max_customers, features, sort_order) values
  ('trial', 'Trial', 0, 0, 'USD', 200, '["All core modules", "Up to 200 customers", "14-day trial"]', 0),
  ('starter', 'Starter', 29, 290, 'USD', 500, '["All core modules", "Up to 500 customers", "Email support"]', 1),
  ('growth', 'Growth', 79, 790, 'USD', 2000, '["Everything in Starter", "Up to 2,000 customers", "Smart Offers + VIP tiers", "Priority email support"]', 2),
  ('professional', 'Professional', 199, 1990, 'USD', 10000, '["Everything in Growth", "Up to 10,000 customers", "Multiple businesses", "Priority support"]', 3),
  ('enterprise', 'Enterprise', null, null, 'USD', null, '["Everything in Professional", "Unlimited customers", "Dedicated support", "Custom onboarding"]', 4)
on conflict (key) do nothing;

-- ── Payments ─────────────────────────────────────────────────────────────
-- A manual ledger, not a live payment integration (see README "Billing" —
-- deliberately no processor is wired up). Platform admins record payments
-- by hand; nothing here charges a card. RLS has zero policies for regular
-- users on purpose, so this table is reachable only through the
-- security-definer admin_* functions below (or the service role).

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  amount numeric not null,
  currency text not null default 'USD',
  status text not null default 'recorded' check (status in ('recorded','refunded','failed')),
  period_start date,
  period_end date,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_business_idx on payments(business_id);

alter table payments enable row level security;
-- intentionally no policies — access only via admin_* security-definer
-- functions, which each check is_platform_admin() themselves.

-- ── Admin RPC surface ────────────────────────────────────────────────────
-- Every function below is filtered/gated by is_platform_admin(), so even
-- if a client called these directly there's nothing to gain: a non-admin
-- gets an empty result set (table-returning functions) or a raised
-- exception (mutating functions).

create or replace function admin_list_businesses()
returns table (
  id uuid, name text, business_type text, subscription_plan text, subscription_status text,
  trial_ends_at timestamptz, currency text, created_at timestamptz,
  owner_email text, member_count bigint, total_customers bigint
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.name, b.business_type, b.subscription_plan, b.subscription_status,
    b.trial_ends_at, b.currency, b.created_at,
    (select u.email from business_users bu join auth.users u on u.id = bu.user_id
     where bu.business_id = b.id and bu.role = 'owner' order by bu.created_at asc limit 1) as owner_email,
    (select count(*) from business_users bu where bu.business_id = b.id) as member_count,
    (select count(*) from customers c where c.business_id = b.id) as total_customers
  from businesses b
  where is_platform_admin()
  order by b.created_at desc;
$$;

create or replace function admin_get_business(p_business_id uuid)
returns table (
  id uuid, name text, business_type text, visit_label text, default_language text,
  subscription_plan text, subscription_status text, trial_ends_at timestamptz,
  currency text, timezone text, created_at timestamptz,
  owner_email text, member_count bigint, total_customers bigint, total_revenue_events numeric
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.name, b.business_type, b.visit_label, b.default_language,
    b.subscription_plan, b.subscription_status, b.trial_ends_at,
    b.currency, b.timezone, b.created_at,
    (select u.email from business_users bu join auth.users u on u.id = bu.user_id
     where bu.business_id = b.id and bu.role = 'owner' order by bu.created_at asc limit 1) as owner_email,
    (select count(*) from business_users bu where bu.business_id = b.id) as member_count,
    (select count(*) from customers c where c.business_id = b.id) as total_customers,
    (select coalesce(sum(amount), 0) from revenue_events re where re.business_id = b.id) as total_revenue_events
  from businesses b
  where b.id = p_business_id and is_platform_admin();
$$;

create or replace function admin_list_business_members(p_business_id uuid)
returns table(user_id uuid, email text, role business_role, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select bu.user_id, u.email, bu.role, bu.created_at
  from business_users bu
  join auth.users u on u.id = bu.user_id
  where bu.business_id = p_business_id and is_platform_admin();
$$;

-- Platform-admin business mutation — deliberately separate from the
-- tenant-facing "owner/admin can update their business" RLS policy, which
-- only lets a business's own owner/admin touch their row.
create or replace function admin_update_business(
  p_business_id uuid,
  p_subscription_plan text default null,
  p_subscription_status text default null,
  p_trial_ends_at timestamptz default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update businesses set
    subscription_plan = coalesce(p_subscription_plan, subscription_plan),
    subscription_status = coalesce(p_subscription_status, subscription_status),
    trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at)
  where id = p_business_id;
end;
$$;

create or replace function admin_overview_stats()
returns table (
  total_businesses bigint,
  trialing_count bigint,
  active_count bigint,
  past_due_count bigint,
  canceled_count bigint,
  signups_last_30d bigint,
  mrr numeric
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from businesses) as total_businesses,
    (select count(*) from businesses where subscription_status = 'trialing') as trialing_count,
    (select count(*) from businesses where subscription_status = 'active') as active_count,
    (select count(*) from businesses where subscription_status = 'past_due') as past_due_count,
    (select count(*) from businesses where subscription_status = 'canceled') as canceled_count,
    (select count(*) from businesses where created_at >= now() - interval '30 days') as signups_last_30d,
    (select coalesce(sum(p.price_monthly), 0)
       from businesses b join plans p on p.key = b.subscription_plan
       where b.subscription_status = 'active') as mrr
  where is_platform_admin();
$$;

create or replace function admin_list_payments(p_business_id uuid default null)
returns table (
  id uuid, business_id uuid, business_name text, plan_id uuid, plan_name text,
  amount numeric, currency text, status text, period_start date, period_end date,
  notes text, recorded_by_email text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    pay.id, pay.business_id, b.name as business_name, pay.plan_id, p.name as plan_name,
    pay.amount, pay.currency, pay.status, pay.period_start, pay.period_end,
    pay.notes, u.email as recorded_by_email, pay.created_at
  from payments pay
  join businesses b on b.id = pay.business_id
  left join plans p on p.id = pay.plan_id
  left join auth.users u on u.id = pay.recorded_by
  where is_platform_admin() and (p_business_id is null or pay.business_id = p_business_id)
  order by pay.created_at desc;
$$;

create or replace function admin_record_payment(
  p_business_id uuid,
  p_amount numeric,
  p_currency text default 'USD',
  p_plan_id uuid default null,
  p_period_start date default null,
  p_period_end date default null,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  insert into payments (business_id, plan_id, amount, currency, period_start, period_end, notes, recorded_by)
  values (p_business_id, p_plan_id, p_amount, p_currency, p_period_start, p_period_end, p_notes, auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

-- To grant someone platform admin access, run directly in the SQL editor:
--   insert into platform_admins (user_id)
--   select id from auth.users where lower(email) = lower('their@email.com');

-- ── Subscription email notifications ────────────────────────────────────
-- Fires straight from Postgres via pg_net (no Edge Function, so this
-- covers every code path that touches `businesses` — signup, admin plan
-- changes, everything): sends the business owner an email when their
-- trial starts and again if their plan moves off the trial tier.
-- Credentials live in Supabase Vault, never in this file — see the
-- one-time setup note below. If the vault secrets aren't set yet, the
-- trigger just no-ops; it never blocks signup or an admin's update.
create extension if not exists pg_net;

create or replace function notify_subscription_email()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner_email text;
  v_plan_name text;
  v_resend_key text;
  v_from_email text;
  v_event text;
  v_subject text;
  v_html text;
  v_lang text;
  v_sales_subject text;
  v_sales_html text;
begin
  if TG_OP = 'INSERT' then
    v_event := 'trial_started';
  elsif TG_OP = 'UPDATE' and NEW.subscription_plan is distinct from OLD.subscription_plan
        and NEW.subscription_plan <> 'trial' then
    v_event := 'plan_changed';
  else
    return NEW;
  end if;

  begin
    select decrypted_secret into v_resend_key from vault.decrypted_secrets where name = 'resend_api_key';
    select decrypted_secret into v_from_email from vault.decrypted_secrets where name = 'resend_from_email';
    if v_resend_key is null or v_from_email is null then
      return NEW;
    end if;

    select u.email into v_owner_email
    from business_users bu join auth.users u on u.id = bu.user_id
    where bu.business_id = NEW.id and bu.role = 'owner'
    order by bu.created_at asc limit 1;
    if v_owner_email is null then
      return NEW;
    end if;

    select name into v_plan_name from plans where key = NEW.subscription_plan;
    v_plan_name := coalesce(v_plan_name, initcap(NEW.subscription_plan));
    v_lang := coalesce(NEW.default_language, 'en');

    if v_event = 'trial_started' then
      if v_lang = 'ar' then
        v_subject := 'مرحبًا بك في SmartManager — بدأت فترتك التجريبية المجانية';
        v_html := '<div dir="rtl" style="font-family:sans-serif;line-height:1.6"><h2>مرحبًا بك في SmartManager 👋</h2>'
          || '<p>تم إنشاء حساب <b>' || NEW.name || '</b> بنجاح، وبدأت فترتك التجريبية المجانية لمدة 14 يومًا.</p>'
          || '<p>تنتهي الفترة التجريبية في: <b>' || to_char(NEW.trial_ends_at, 'YYYY-MM-DD') || '</b></p>'
          || '<p>يمكنك الترقية في أي وقت من داخل لوحة التحكم.</p></div>';
      else
        v_subject := 'Welcome to SmartManager — your free trial has started';
        v_html := '<div style="font-family:sans-serif;line-height:1.6"><h2>Welcome to SmartManager 👋</h2>'
          || '<p><b>' || NEW.name || '</b> is all set up, and your 14-day free trial has started.</p>'
          || '<p>Your trial ends on: <b>' || to_char(NEW.trial_ends_at, 'YYYY-MM-DD') || '</b></p>'
          || '<p>You can upgrade anytime from your dashboard.</p></div>';
      end if;
    else
      if v_lang = 'ar' then
        v_subject := 'تحديث اشتراك SmartManager: باقة ' || v_plan_name;
        v_html := '<div dir="rtl" style="font-family:sans-serif;line-height:1.6"><h2>تم تحديث اشتراكك</h2>'
          || '<p>أصبح اشتراك <b>' || NEW.name || '</b> الآن على باقة <b>' || v_plan_name || '</b>.</p>'
          || '<p>شكرًا لاستخدامك SmartManager.</p></div>';
      else
        v_subject := 'Your SmartManager subscription is now on the ' || v_plan_name || ' plan';
        v_html := '<div style="font-family:sans-serif;line-height:1.6"><h2>Subscription updated</h2>'
          || '<p><b>' || NEW.name || '</b> is now on the <b>' || v_plan_name || '</b> plan.</p>'
          || '<p>Thanks for using SmartManager.</p></div>';
      end if;
    end if;

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', v_from_email, 'to', jsonb_build_array(v_owner_email), 'subject', v_subject, 'html', v_html)
    );

    -- Internal record for the sales team — every signup and every plan
    -- change, regardless of who triggered it (self-service or admin).
    v_sales_subject := case when v_event = 'trial_started'
      then 'New signup: ' || NEW.name || ' (' || v_plan_name || ' trial)'
      else 'Plan change: ' || NEW.name || ' -> ' || v_plan_name
    end;
    v_sales_html := '<div style="font-family:sans-serif;line-height:1.6">'
      || '<p><b>Event:</b> ' || v_event || '</p>'
      || '<p><b>Business:</b> ' || NEW.name || '</p>'
      || '<p><b>Owner email:</b> ' || v_owner_email || '</p>'
      || '<p><b>Plan:</b> ' || v_plan_name || ' (' || NEW.subscription_plan || ')</p>'
      || '<p><b>Billing interval:</b> ' || coalesce(NEW.billing_interval, 'monthly') || '</p>'
      || '<p><b>Status:</b> ' || NEW.subscription_status || '</p>'
      || '<p><b>Trial ends:</b> ' || to_char(NEW.trial_ends_at, 'YYYY-MM-DD') || '</p>'
      || '</div>';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', v_from_email, 'to', jsonb_build_array('sales@smartmanager.me'), 'subject', v_sales_subject, 'html', v_sales_html)
    );
  exception when others then
    -- Never let an email/Resend hiccup break signup or an admin's update.
    null;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_business_trial_started on businesses;
create trigger trg_business_trial_started
  after insert on businesses
  for each row execute function notify_subscription_email();

drop trigger if exists trg_business_plan_changed on businesses;
create trigger trg_business_plan_changed
  after update of subscription_plan on businesses
  for each row execute function notify_subscription_email();

-- One-time setup (run directly in the SQL editor, not part of this file,
-- so real credentials never end up in git history):
--   select vault.create_secret('re_xxxxxxxx',        'resend_api_key');
--   select vault.create_secret('notify@yourdomain.com', 'resend_from_email');
-- The from-address's domain must be verified in Resend, or sends will fail
-- silently (caught by the exception handler above).

-- ═══════════════════════════════════════════════════════════════════════
-- Pricing, Plans & Sign-up Flow — database-driven SaaS subscription
-- architecture. The database is the single source of truth for plan
-- pricing, limits, features and trial settings; nothing here is
-- duplicated in frontend code. See create_business() below for how a
-- signup's selected plan becomes the business's live subscription.
-- ═══════════════════════════════════════════════════════════════════════

-- `key` already serves as the plan's slug (unique, url-safe) — no
-- separate slug column, so there's nothing to drift out of sync.
alter table plans
  add column if not exists description text,
  add column if not exists short_description text,
  add column if not exists location_limit int,
  add column if not exists user_limit int,
  add column if not exists trial_days int,
  add column if not exists badge_text text,
  add column if not exists is_featured boolean not null default false;

create table if not exists plan_features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'core',
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table plan_features enable row level security;
create policy "anyone can read active features" on plan_features
  for select using (is_active or is_platform_admin());
create policy "platform admins manage features" on plan_features
  for all using (is_platform_admin()) with check (is_platform_admin());

create table if not exists plan_feature_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  feature_id uuid not null references plan_features(id) on delete cascade,
  enabled boolean not null default true,
  value_text text,
  display_text text,
  display_order int not null default 0,
  unique (plan_id, feature_id)
);

alter table plan_feature_links enable row level security;
create policy "anyone can read plan feature links" on plan_feature_links
  for select using (true);
create policy "platform admins manage plan feature links" on plan_feature_links
  for all using (is_platform_admin()) with check (is_platform_admin());

-- Singleton row — admin-editable trial length, read by both the public
-- pricing page and create_business() (never hard-coded).
create table if not exists subscription_settings (
  is_singleton boolean primary key default true check (is_singleton),
  free_trial_enabled boolean not null default true,
  free_trial_days int not null default 14,
  updated_at timestamptz not null default now()
);
insert into subscription_settings (is_singleton) values (true) on conflict do nothing;

alter table subscription_settings enable row level security;
create policy "anyone can read subscription settings" on subscription_settings
  for select using (true);
create policy "platform admins manage subscription settings" on subscription_settings
  for all using (is_platform_admin()) with check (is_platform_admin());

-- Append-only ledger behind `businesses`' live denormalized subscription
-- columns (below) — one row per state change, ready for a real payment
-- gateway's webhooks to write into later.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null check (status in ('trial','active','past_due','canceled','expired','suspended')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','annual')),
  price numeric,
  currency text not null default 'USD',
  trial_start timestamptz,
  trial_end timestamptz,
  subscription_start timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_business_idx on subscriptions(business_id, created_at desc);

alter table subscriptions enable row level security;
create policy "business members can read their subscriptions" on subscriptions
  for select using (is_business_member(business_id) or is_platform_admin());
-- no insert/update/delete policies: written only by security-definer RPCs.

create table if not exists plan_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  plan_id uuid references plans(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table plan_audit_log enable row level security;
create policy "platform admins read audit log" on plan_audit_log
  for select using (is_platform_admin());

alter table businesses
  add column if not exists billing_interval text not null default 'monthly' check (billing_interval in ('monthly','annual')),
  add column if not exists subscription_price numeric,
  add column if not exists subscription_currency text not null default 'USD';

alter table businesses drop constraint if exists businesses_subscription_status_check;
alter table businesses add constraint businesses_subscription_status_check
  check (subscription_status in ('trialing','active','past_due','canceled','expired','suspended'));

-- create_business() now requires a plan up front (see Signup/Pricing in
-- the app): plan selection happens before account creation, and the
-- server — never the client — resolves the real price/limits/trial from
-- p_plan_id. This replaces the earlier 5-arg version.
drop function if exists create_business(text, text, text, text, text);

create or replace function create_business(
  p_name text,
  p_plan_id uuid,
  p_billing_interval text default 'monthly',
  p_business_type text default 'other',
  p_visit_label text default 'Visit',
  p_language text default 'en',
  p_currency text default 'SAR'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  v_plan plans%rowtype;
  v_trial_days int;
  v_price numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from plans where id = p_plan_id and is_active = true;
  if not found then
    raise exception 'invalid or inactive plan';
  end if;
  if p_billing_interval not in ('monthly','annual') then
    raise exception 'invalid billing interval';
  end if;

  select coalesce(v_plan.trial_days, free_trial_days) into v_trial_days from subscription_settings limit 1;
  v_price := case when p_billing_interval = 'annual' then v_plan.price_yearly else v_plan.price_monthly end;

  insert into businesses (
    name, business_type, visit_label, default_language, currency,
    subscription_plan, subscription_status, trial_ends_at,
    billing_interval, subscription_price, subscription_currency
  )
  values (
    p_name, p_business_type, p_visit_label, p_language, p_currency,
    v_plan.key, 'trialing', now() + make_interval(days => coalesce(v_trial_days, 14)),
    p_billing_interval, v_price, v_plan.currency
  )
  returning id into new_id;

  insert into business_users (business_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  insert into subscriptions (business_id, plan_id, status, billing_interval, price, currency, trial_start, trial_end)
  values (new_id, v_plan.id, 'trial', p_billing_interval, v_price, v_plan.currency, now(), now() + make_interval(days => coalesce(v_trial_days, 14)));

  insert into segmentation_rules (business_id, segment_key, rule_config) values
    (new_id, 'new',        '{"days": 14}'),
    (new_id, 'active',     '{"days": 30}'),
    (new_id, 'due',        '{"days_before": 5}'),
    (new_id, 'inactive',   '{"days": 30}'),
    (new_id, 'lost',       '{"days": 90}'),
    (new_id, 'vip',        '{"min_spending": 3000, "min_visits": 10}'),
    (new_id, 'high_value', '{"min_lifetime_value": 2000}'),
    (new_id, 'frequent',   '{"min_visits_per_90d": 3}'),
    (new_id, 'at_risk',    '{"overdue_ratio": 1.3}');

  insert into vip_tiers (business_id, tier_name, criteria, sort_order) values
    (new_id, 'VIP',      '{"min_spending": 3000}',  1),
    (new_id, 'Gold',     '{"min_spending": 8000}',  2),
    (new_id, 'Platinum', '{"min_spending": 20000}', 3);

  return new_id;
end;
$$;

-- Platform-admin plan change — appends to the subscriptions ledger too.
create or replace function admin_update_business(
  p_business_id uuid,
  p_subscription_plan text default null,
  p_subscription_status text default null,
  p_trial_ends_at timestamptz default null,
  p_billing_interval text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan plans%rowtype;
  v_old businesses%rowtype;
  v_new_interval text;
  v_price numeric;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_old from businesses where id = p_business_id;
  if not found then raise exception 'business not found'; end if;

  v_new_interval := coalesce(p_billing_interval, v_old.billing_interval);

  if p_subscription_plan is not null then
    select * into v_plan from plans where key = p_subscription_plan;
    if found then
      v_price := case when v_new_interval = 'annual' then v_plan.price_yearly else v_plan.price_monthly end;
    end if;
  end if;

  update businesses set
    subscription_plan = coalesce(p_subscription_plan, subscription_plan),
    subscription_status = coalesce(p_subscription_status, subscription_status),
    trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at),
    billing_interval = v_new_interval,
    subscription_price = coalesce(v_price, subscription_price)
  where id = p_business_id;

  if p_subscription_plan is not null and p_subscription_plan is distinct from v_old.subscription_plan and v_plan.id is not null then
    insert into subscriptions (business_id, plan_id, status, billing_interval, price, currency, subscription_start, current_period_start)
    values (p_business_id, v_plan.id, coalesce(p_subscription_status, v_old.subscription_status, 'active'), v_new_interval, v_price, v_plan.currency, now(), now());
  end if;
end;
$$;

-- Enforced server-side — the client never gets to decide its own limit.
create or replace function enforce_customer_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_count int;
begin
  select p.max_customers into v_limit
  from businesses b join plans p on p.key = b.subscription_plan
  where b.id = NEW.business_id;

  if v_limit is not null then
    select count(*) into v_count from customers where business_id = NEW.business_id;
    if v_count >= v_limit then
      raise exception 'customer_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;
revoke execute on function enforce_customer_limit() from public;

drop trigger if exists trg_enforce_customer_limit on customers;
create trigger trg_enforce_customer_limit
  before insert on customers
  for each row execute function enforce_customer_limit();

-- ── Public read API (pricing page + signup — no auth required) ─────────

create or replace function list_public_plans()
returns table (
  id uuid, key text, name text, description text, short_description text,
  price_monthly numeric, price_yearly numeric, currency text,
  max_customers int, location_limit int, user_limit int, trial_days int,
  badge_text text, is_featured boolean, sort_order int,
  features jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.key, p.name, p.description, p.short_description,
    p.price_monthly, p.price_yearly, p.currency,
    p.max_customers, p.location_limit, p.user_limit, p.trial_days,
    p.badge_text, p.is_featured, p.sort_order,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name, 'category', f.category,
        'display_text', pfl.display_text, 'value_text', pfl.value_text
      ) order by pfl.display_order, f.display_order)
      from plan_feature_links pfl join plan_features f on f.id = pfl.feature_id
      where pfl.plan_id = p.id and pfl.enabled = true and f.is_active = true
    ), '[]'::jsonb) as features
  from plans p
  where p.is_active = true and p.key <> 'trial'
  order by p.sort_order asc;
$$;
grant execute on function list_public_plans() to anon, authenticated;

create or replace function get_subscription_settings()
returns table (free_trial_enabled boolean, free_trial_days int)
language sql stable security definer set search_path = public as $$
  select free_trial_enabled, free_trial_days from subscription_settings limit 1;
$$;
grant execute on function get_subscription_settings() to anon, authenticated;

-- ── Admin plan management RPCs ──────────────────────────────────────────

create or replace function admin_list_plans_full()
returns table (
  id uuid, key text, name text, description text, short_description text,
  price_monthly numeric, price_yearly numeric, currency text,
  max_customers int, location_limit int, user_limit int, trial_days int,
  badge_text text, is_featured boolean, is_active boolean, sort_order int,
  created_at timestamptz, updated_at timestamptz,
  subscriber_count bigint,
  features jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.key, p.name, p.description, p.short_description,
    p.price_monthly, p.price_yearly, p.currency,
    p.max_customers, p.location_limit, p.user_limit, p.trial_days,
    p.badge_text, p.is_featured, p.is_active, p.sort_order,
    p.created_at, p.updated_at,
    (select count(*) from businesses b where b.subscription_plan = p.key) as subscriber_count,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature_id', f.id, 'key', f.key, 'name', f.name, 'category', f.category,
        'enabled', pfl.enabled, 'display_text', pfl.display_text, 'value_text', pfl.value_text
      ) order by f.display_order)
      from plan_feature_links pfl join plan_features f on f.id = pfl.feature_id
      where pfl.plan_id = p.id
    ), '[]'::jsonb) as features
  from plans p
  where is_platform_admin()
  order by p.sort_order asc;
$$;

create or replace function admin_list_plan_features()
returns table (id uuid, key text, name text, description text, category text, display_order int, is_active boolean)
language sql stable security definer set search_path = public as $$
  select id, key, name, description, category, display_order, is_active
  from plan_features
  where is_platform_admin()
  order by display_order asc;
$$;

create or replace function admin_upsert_plan(
  p_id uuid default null,
  p_key text default null,
  p_name text default null,
  p_description text default null,
  p_short_description text default null,
  p_price_monthly numeric default null,
  p_price_yearly numeric default null,
  p_currency text default 'USD',
  p_max_customers int default null,
  p_location_limit int default null,
  p_user_limit int default null,
  p_trial_days int default null,
  p_badge_text text default null,
  p_is_featured boolean default false,
  p_is_active boolean default true,
  p_sort_order int default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_id is not null then
    select to_jsonb(p) into v_old from plans p where id = p_id;
  end if;

  insert into plans (
    id, key, name, description, short_description, price_monthly, price_yearly, currency,
    max_customers, location_limit, user_limit, trial_days, badge_text, is_featured, is_active, sort_order, updated_at
  ) values (
    coalesce(p_id, gen_random_uuid()), p_key, p_name, p_description, p_short_description,
    p_price_monthly, p_price_yearly, coalesce(p_currency, 'USD'),
    p_max_customers, p_location_limit, p_user_limit, p_trial_days, p_badge_text,
    coalesce(p_is_featured, false), coalesce(p_is_active, true), coalesce(p_sort_order, 0), now()
  )
  on conflict (id) do update set
    key = excluded.key, name = excluded.name, description = excluded.description,
    short_description = excluded.short_description, price_monthly = excluded.price_monthly,
    price_yearly = excluded.price_yearly, currency = excluded.currency,
    max_customers = excluded.max_customers, location_limit = excluded.location_limit,
    user_limit = excluded.user_limit, trial_days = excluded.trial_days,
    badge_text = excluded.badge_text, is_featured = excluded.is_featured,
    is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;

  select to_jsonb(p) into v_new from plans p where id = v_id;
  insert into plan_audit_log (admin_user_id, action, plan_id, old_value, new_value)
  values (auth.uid(), case when v_old is null then 'create_plan' else 'update_plan' end, v_id, v_old, v_new);

  return v_id;
end;
$$;

create or replace function admin_set_plan_feature(
  p_plan_id uuid,
  p_feature_id uuid,
  p_enabled boolean,
  p_display_text text default null,
  p_value_text text default null,
  p_display_order int default 0
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  insert into plan_feature_links (plan_id, feature_id, enabled, display_text, value_text, display_order)
  values (p_plan_id, p_feature_id, p_enabled, p_display_text, p_value_text, p_display_order)
  on conflict (plan_id, feature_id) do update set
    enabled = excluded.enabled, display_text = excluded.display_text,
    value_text = excluded.value_text, display_order = excluded.display_order;

  insert into plan_audit_log (admin_user_id, action, plan_id, new_value)
  values (auth.uid(), 'set_plan_feature', p_plan_id, jsonb_build_object('feature_id', p_feature_id, 'enabled', p_enabled));
end;
$$;

create or replace function admin_duplicate_plan(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_new_id uuid;
  v_src plans%rowtype;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_src from plans where id = p_plan_id;
  if not found then raise exception 'plan not found'; end if;

  insert into plans (key, name, description, short_description, price_monthly, price_yearly, currency,
    max_customers, location_limit, user_limit, trial_days, badge_text, is_featured, is_active, sort_order)
  values (v_src.key || '_copy_' || substr(gen_random_uuid()::text, 1, 6), v_src.name || ' (Copy)',
    v_src.description, v_src.short_description, v_src.price_monthly, v_src.price_yearly, v_src.currency,
    v_src.max_customers, v_src.location_limit, v_src.user_limit, v_src.trial_days, v_src.badge_text,
    false, false, v_src.sort_order + 1)
  returning id into v_new_id;

  insert into plan_feature_links (plan_id, feature_id, enabled, display_text, value_text, display_order)
  select v_new_id, feature_id, enabled, display_text, value_text, display_order
  from plan_feature_links where plan_id = p_plan_id;

  insert into plan_audit_log (admin_user_id, action, plan_id, new_value)
  values (auth.uid(), 'duplicate_plan', v_new_id, jsonb_build_object('source_plan_id', p_plan_id));

  return v_new_id;
end;
$$;

create or replace function admin_reorder_plans(p_plan_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  i int;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;
  for i in 1..array_length(p_plan_ids, 1) loop
    update plans set sort_order = i - 1 where id = p_plan_ids[i];
  end loop;
  insert into plan_audit_log (admin_user_id, action, new_value)
  values (auth.uid(), 'reorder_plans', to_jsonb(p_plan_ids));
end;
$$;

create or replace function admin_delete_plan(p_plan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_count int;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select key into v_key from plans where id = p_plan_id;
  if v_key is null then raise exception 'plan not found'; end if;

  select count(*) into v_count from businesses where subscription_plan = v_key;
  if v_count > 0 then
    raise exception 'plan_in_use: % business(es) are on this plan — deactivate instead of deleting', v_count;
  end if;

  delete from plans where id = p_plan_id;
  insert into plan_audit_log (admin_user_id, action, plan_id) values (auth.uid(), 'delete_plan', p_plan_id);
end;
$$;

create or replace function admin_update_subscription_settings(p_free_trial_enabled boolean, p_free_trial_days int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
begin
  if not is_platform_admin() then
    raise exception 'not authorized';
  end if;
  select to_jsonb(s) into v_old from subscription_settings s limit 1;

  update subscription_settings set
    free_trial_enabled = p_free_trial_enabled,
    free_trial_days = p_free_trial_days,
    updated_at = now();

  insert into plan_audit_log (admin_user_id, action, old_value, new_value)
  values (auth.uid(), 'update_subscription_settings', v_old,
    jsonb_build_object('free_trial_enabled', p_free_trial_enabled, 'free_trial_days', p_free_trial_days));
end;
$$;

-- Tenant-side: which feature keys does the signed-in business's plan
-- include — every feature gate in the app (VIP, Smart Offers,
-- Memberships, …) reads from this instead of re-deriving plan logic.
create or replace function my_plan_features()
returns table (key text)
language sql stable security definer set search_path = public as $$
  select f.key
  from businesses b
  join plans p on p.key = b.subscription_plan
  join plan_feature_links pfl on pfl.plan_id = p.id and pfl.enabled = true
  join plan_features f on f.id = pfl.feature_id and f.is_active = true
  where b.id in (select business_id from business_users where user_id = auth.uid());
$$;
grant execute on function my_plan_features() to authenticated;

-- Supersedes the earlier admin_overview_stats() with MRR/ARR, trial→paid
-- conversion, and revenue-by-plan.
drop function if exists admin_overview_stats();
create or replace function admin_overview_stats()
returns table (
  total_businesses bigint,
  trialing_count bigint,
  active_count bigint,
  past_due_count bigint,
  canceled_count bigint,
  signups_last_30d bigint,
  mrr numeric,
  arr numeric,
  trial_to_paid_conversion_pct numeric,
  revenue_by_plan jsonb
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from businesses) as total_businesses,
    (select count(*) from businesses where subscription_status = 'trialing') as trialing_count,
    (select count(*) from businesses where subscription_status = 'active') as active_count,
    (select count(*) from businesses where subscription_status = 'past_due') as past_due_count,
    (select count(*) from businesses where subscription_status = 'canceled') as canceled_count,
    (select count(*) from businesses where created_at >= now() - interval '30 days') as signups_last_30d,
    (select coalesce(sum(p.price_monthly), 0)
       from businesses b join plans p on p.key = b.subscription_plan
       where b.subscription_status = 'active') as mrr,
    (select coalesce(sum(p.price_monthly), 0) * 12
       from businesses b join plans p on p.key = b.subscription_plan
       where b.subscription_status = 'active') as arr,
    (select case when count(*) filter (where subscription_status in ('trialing','active','past_due','canceled','expired')) = 0 then 0
       else round(100.0 * count(*) filter (where subscription_status in ('active','past_due')) /
         count(*) filter (where subscription_status in ('trialing','active','past_due','canceled','expired')), 1)
       end
     from businesses) as trial_to_paid_conversion_pct,
    (select coalesce(jsonb_agg(jsonb_build_object('plan', plan_key, 'subscribers', subscribers, 'mrr', plan_mrr)), '[]'::jsonb)
     from (
       select b.subscription_plan as plan_key, count(*) as subscribers,
         coalesce(sum(p.price_monthly) filter (where b.subscription_status = 'active'), 0) as plan_mrr
       from businesses b join plans p on p.key = b.subscription_plan
       group by b.subscription_plan
     ) x) as revenue_by_plan
  where is_platform_admin();
$$;

-- ── Seed: the four sellable plans + a 19-feature catalog ────────────────
-- Adjust freely from Admin → Plans afterwards; these are initial values
-- only, matching the product's launch pricing.

insert into plan_features (key, name, category, display_order) values
  ('customer_management', 'Customer Management', 'core', 1),
  ('recovery', 'Recovery', 'core', 2),
  ('reactivation', 'Reactivation', 'core', 3),
  ('retention', 'Retention', 'core', 4),
  ('rewards', 'Rewards', 'core', 5),
  ('customer_segmentation', 'Customer Segmentation', 'core', 6),
  ('bookings', 'Bookings', 'core', 7),
  ('basic_analytics', 'Basic Analytics', 'analytics', 8),
  ('vip', 'VIP', 'growth_tools', 9),
  ('smart_offers', 'Smart Offers', 'growth_tools', 10),
  ('advanced_segmentation', 'Advanced Segmentation', 'growth_tools', 11),
  ('advanced_analytics', 'Advanced Analytics', 'analytics', 12),
  ('memberships', 'Memberships', 'growth_tools', 13),
  ('revenue_opportunity', 'Revenue Opportunity', 'analytics', 14),
  ('advanced_customer_insights', 'Advanced Customer Insights', 'analytics', 15),
  ('advanced_revenue_analytics', 'Advanced Revenue Analytics', 'analytics', 16),
  ('advanced_team_controls', 'Advanced Team Controls', 'team_support', 17),
  ('multi_location', 'Multi-location Support', 'team_support', 18),
  ('priority_support', 'Priority Support', 'team_support', 19)
on conflict (key) do update set name = excluded.name, category = excluded.category, display_order = excluded.display_order;

-- The old generic "trial" plan is superseded: businesses now trial on
-- whichever real plan they picked at signup (see create_business() above).
update plans set is_active = false where key = 'trial';

insert into plans (key, name, description, short_description, price_monthly, price_yearly, currency,
  max_customers, location_limit, user_limit, badge_text, is_featured, is_active, sort_order)
values
  ('starter', 'Starter', 'Everything a growing business needs to start turning customers into repeat customers.',
    'Get started with customer retention.', 49, 490, 'USD', 500, 1, null, null, false, true, 1),
  ('growth', 'Growth', 'Advanced tools to recover lost revenue and build real customer loyalty.',
    'Turn more customers into repeat customers.', 99, 990, 'USD', 2500, 3, null, 'Most Popular', true, true, 2),
  ('professional', 'Professional', 'The full platform for businesses scaling retention across multiple locations.',
    'Scale customer retention across your business.', 249, 2490, 'USD', 10000, 10, null, null, false, true, 3),
  ('enterprise', 'Enterprise', 'A tailored plan for large, multi-location operations with custom needs.',
    'Built for scale. Talk to us.', null, null, 'USD', null, null, null, null, false, true, 4)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, short_description = excluded.short_description,
  price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly, currency = excluded.currency,
  max_customers = excluded.max_customers, location_limit = excluded.location_limit, user_limit = excluded.user_limit,
  badge_text = excluded.badge_text, is_featured = excluded.is_featured, is_active = excluded.is_active,
  sort_order = excluded.sort_order, updated_at = now();

with plan_feature_map(plan_key, feature_key, ord) as (
  values
    ('starter','customer_management',1), ('starter','recovery',2), ('starter','reactivation',3),
    ('starter','retention',4), ('starter','rewards',5), ('starter','customer_segmentation',6),
    ('starter','bookings',7), ('starter','basic_analytics',8),

    ('growth','customer_management',1), ('growth','recovery',2), ('growth','reactivation',3),
    ('growth','retention',4), ('growth','rewards',5), ('growth','customer_segmentation',6),
    ('growth','bookings',7), ('growth','basic_analytics',8),
    ('growth','vip',9), ('growth','smart_offers',10), ('growth','advanced_segmentation',11),
    ('growth','advanced_analytics',12), ('growth','memberships',13), ('growth','revenue_opportunity',14),
    ('growth','advanced_customer_insights',15),

    ('professional','customer_management',1), ('professional','recovery',2), ('professional','reactivation',3),
    ('professional','retention',4), ('professional','rewards',5), ('professional','customer_segmentation',6),
    ('professional','bookings',7), ('professional','basic_analytics',8),
    ('professional','vip',9), ('professional','smart_offers',10), ('professional','advanced_segmentation',11),
    ('professional','advanced_analytics',12), ('professional','memberships',13), ('professional','revenue_opportunity',14),
    ('professional','advanced_customer_insights',15),
    ('professional','advanced_revenue_analytics',16), ('professional','advanced_team_controls',17),
    ('professional','multi_location',18), ('professional','priority_support',19),

    ('enterprise','customer_management',1), ('enterprise','recovery',2), ('enterprise','reactivation',3),
    ('enterprise','retention',4), ('enterprise','rewards',5), ('enterprise','customer_segmentation',6),
    ('enterprise','bookings',7), ('enterprise','basic_analytics',8),
    ('enterprise','vip',9), ('enterprise','smart_offers',10), ('enterprise','advanced_segmentation',11),
    ('enterprise','advanced_analytics',12), ('enterprise','memberships',13), ('enterprise','revenue_opportunity',14),
    ('enterprise','advanced_customer_insights',15),
    ('enterprise','advanced_revenue_analytics',16), ('enterprise','advanced_team_controls',17),
    ('enterprise','multi_location',18), ('enterprise','priority_support',19)
)
insert into plan_feature_links (plan_id, feature_id, enabled, display_order)
select p.id, f.id, true, m.ord
from plan_feature_map m
join plans p on p.key = m.plan_key
join plan_features f on f.key = m.feature_key
on conflict (plan_id, feature_id) do update set enabled = true, display_order = excluded.display_order;

-- To grant/adjust the Resend subscription-email trigger's credentials,
-- see the "Subscription email notifications" section above — unaffected
-- by this migration.

-- ── Business working hours ──────────────────────────────────────────────
-- Drives the Bookings calendar's visible time window (see
-- src/lib/bookingUtils.js). Default 8-20 matches the app's previous
-- hard-coded constants, so existing businesses see no change until they
-- set their own hours in Settings -> Business.
alter table businesses
  add column if not exists business_hours_start int not null default 8 check (business_hours_start >= 0 and business_hours_start <= 23),
  add column if not exists business_hours_end int not null default 20 check (business_hours_end >= 1 and business_hours_end <= 24);

alter table businesses drop constraint if exists businesses_hours_order_check;
alter table businesses add constraint businesses_hours_order_check check (business_hours_end > business_hours_start);
