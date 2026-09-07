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

## What's next

Nothing from the original build brief remains unbuilt at the data-model
level — every table Phase 1-5 needs already exists in `supabase/schema.sql`.
The one genuinely external dependency left is connecting a real payment
processor for Billing.

## Tech stack

- React + Vite, React Router
- Tailwind CSS
- Supabase (Postgres + Realtime + Auth)
- recharts (charts), lucide-react (icons), papaparse + xlsx (import)
