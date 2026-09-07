-- SmartManager Loyalty — Supabase schema
-- Run once in Supabase: SQL Editor > New query > paste this file > Run.
--
-- Multi-tenant model: every business (clinic/salon/gym/etc.) using the
-- product is a row in `businesses`. Every other table carries a
-- `business_id` and is locked down with Row Level Security so a business
-- only ever sees its own data. Membership + role live in `business_users`.

create extension if not exists "pgcrypto";

-- ── Tenancy ──────────────────────────────────────────────────────────────

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null default 'other'
    check (business_type in ('clinic','dental','physiotherapy','beauty_salon','spa','gym','barber','car_service','training_center','consultant','other')),
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
  source text not null default 'manual' check (source in ('manual','import')),
  created_at timestamptz not null default now()
);
create index if not exists customer_visits_business_idx on customer_visits(business_id);
create index if not exists customer_visits_customer_idx on customer_visits(customer_id);

-- Per-customer aggregates, blending real visit rows with import rollups
-- (GREATEST so a business that later logs granular visits doesn't lose the
-- history it imported on day one).
create or replace view customer_stats as
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
create or replace view customer_segment_flags as
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
create or replace view customer_overview as
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
    'vip_tiers','customer_vip_status','offers','offer_recommendations','revenue_events'
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
