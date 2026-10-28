# SmartManager Loyalty

A customer retention, recovery, reactivation, and rewards platform for SMBs
(clinics, salons, spas, gyms, barbers, and other recurring-customer
businesses) — built on React + Vite + Tailwind, backed by Supabase
(Postgres + Auth + Realtime).

**This is not a CRM and not WhatsApp automation.** It tells staff *who* to
contact, *why*, and *what to say* — then opens a normal WhatsApp chat with a
pre-filled message for a human to review and send. No WhatsApp Business API,
no bulk sending, no chatbot.

## How it's different from a typical CRM

The product's one job: turn one-time customers into returning customers, by
surfacing a **Next Best Action** for every customer, backed by transparent,
configurable, rule-based scoring (no black-box AI pretending to be smart —
see `src/lib/segmentation.js`).

## Multi-tenant model

Every business that signs up is isolated: a `businesses` row, one or more
`business_users` (Owner/Admin/Manager/Staff), and every other table carries
a `business_id` enforced by Postgres Row Level Security. See
`supabase/schema.sql` for the full schema and policies.

## 1. Create a Supabase project

1. Go to https://supabase.com, create a new project, wait for it to provision.
2. In **SQL Editor > New query**, paste in `supabase/schema.sql` and run it.
   This creates every table, the `create_business()` onboarding function,
   the segmentation views, and RLS policies.
3. In **Authentication > Providers > Email**, leave "Allow new users to
   sign up" **on** — unlike an internal tool, this product is meant to be
   self-service: anyone can create a business account from the Sign Up page.
4. In **Project Settings > API**, copy your Project URL and `anon` public key.

## 2. Configure the app

```bash
cp .env.example .env
# then edit .env with your Project URL and anon key
```

## 3. Run it locally

```bash
npm install
npm run dev
```

## What's here

**Phase 1 — Foundation**
- Self-service signup → business onboarding (`create_business` RPC creates
  the business, makes you Owner, and seeds default segmentation/VIP rules)
- Multi-tenant auth via Supabase, RLS-enforced business isolation
- Customer database with CRUD
- CSV/Excel customer import (flexible column matching) with an immediate
  "your business has N customers, X are inactive…" summary
- Customer profile with visit timeline, Next Best Action, and a message
  generator (Arabic + English) that hands off to "Open WhatsApp"
- Dashboard: customer counts by segment, recovery/rewards/revenue tallies,
  and a ranked "Today's Recommended Actions" list

**Phase 2 — Segmentation, Recovery, Reactivation, Retention**
- Segmentation Rules settings — every threshold is business-editable
- Recovery pipeline (New → Contacted → Interested → Follow-up Required →
  Converted → Lost) with a "FOLLOW UP NOW" flag on stale leads
- Reactivation: customers bucketed by 30+/60+/90+/long-term-lost inactivity
- Retention: Due-soon and At-Risk lists, prioritized

**Phase 3 — Rewards, VIP, Smart Offers**
- Configurable points/visits/spending reward programs
- VIP tiers with non-discount recommended actions (thank-you, priority
  booking, exclusive access — never a default discount)
- Smart Offers matched live to customer segments, with a reason for each

**Phase 4 — Analytics & advanced scoring**
- Revenue Analytics page: revenue recovered (with a monthly trend chart),
  revenue from offers, VIP revenue, the recovery funnel, reactivation rate,
  retention rate, repeat rate, average customer lifetime value
- Transparent 0-100 churn risk score (`churnRiskScore` in
  `src/lib/segmentation.js`) with a visible breakdown — the seam a real
  model could replace later, not a black box

**Phase 5 — Team, multi-business, billing groundwork**
- Team page: invite teammates by email with a role (Owner/Admin/Manager/
  Staff); if they don't have an account yet, they join automatically the
  moment they sign up with that email (`invite_member` / `claim_invites`
  in `supabase/schema.sql`)
- A user can belong to more than one business — a switcher appears in the
  sidebar once they do, and Business Settings has a "New business" action
- Business Settings page (name, type, visit label, language, currency —
  Owner/Admin only)
- Billing page: tracks plan + 14-day trial status. **No payment processor
  is wired up** — this is deliberately honest rather than a fake checkout;
  wiring a real processor (e.g. Stripe) is the next step when you're ready
  to charge

**Phase 7 — Database-driven pricing, plans & sign-up flow**
- `/pricing`: a public, pre-auth pricing page reading live from the
  database (`list_public_plans()` / `get_subscription_settings()`) — no
  plan pricing, limits, or feature list is ever hard-coded in the
  frontend. Monthly/Annual toggle with dynamically computed savings
  (never a hard-coded "17%").
- Sign-up now requires picking a plan + billing interval on `/pricing`
  first; `/signup` shows that selection and `create_business()` resolves
  the real price/limits/trial server-side from the chosen `plan_id` — the
  client can never submit its own price.
- Admin → Plans: full plan editor (pricing, limits, trial-day override,
  feature toggles by category, live preview, duplicate/reorder/
  activate/deactivate, delete guarded when businesses are on the plan) —
  backed by `admin_upsert_plan` / `admin_set_plan_feature` /
  `admin_duplicate_plan` / `admin_reorder_plans` / `admin_delete_plan`,
  each writing to `plan_audit_log`.
- Admin → Settings: global free-trial toggle + day count
  (`subscription_settings`, read by `create_business()` — never
  hard-coded).
- `enforce_customer_limit()` (a `customers` trigger) enforces each plan's
  customer cap server-side; `my_plan_features()` + `usePlanFeatures()`
  gate premium pages (VIP, Smart Offers, Memberships) behind an upgrade
  prompt instead of hiding them.
- `subscriptions` is an append-only ledger behind `businesses`' live
  `subscription_plan`/`subscription_status`/`billing_interval`/
  `subscription_price` columns — ready for a real payment gateway's
  webhooks to write into later. No payment is faked anywhere: Billing's
  Upgrade/Downgrade/Change interval/Cancel actions go to a contact-us
  email, exactly like before.

## What's next

Nothing from the original build brief remains unbuilt at the data-model
level — every table Phase 1-7 needs already exists in `supabase/schema.sql`.
The one genuinely external dependency left is connecting a real payment
processor for Billing (and, downstream of that, self-serve plan changes
from `/pricing` for an already-signed-up business).

## Tech stack

- React + Vite, React Router
- Tailwind CSS
- Supabase (Postgres + Realtime + Auth)
- recharts (charts), lucide-react (icons), papaparse + xlsx (import)
