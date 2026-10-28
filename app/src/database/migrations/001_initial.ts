import type { Migration } from "./index";

// NOTE: statements are split on ";\n", so never put a semicolon-newline inside a string literal.
export const m001: Migration = {
  version: 1,
  name: "initial schema",
  sql: `
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  phone_norm TEXT,
  email TEXT,
  email_norm TEXT,
  birthday TEXT,
  notes TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp','sms','call','email','none')),
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('granted','unknown','do_not_contact')),
  custom_fields TEXT NOT NULL DEFAULT '{}',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX idx_customers_phone ON customers(phone_norm);
CREATE INDEX idx_customers_email ON customers(email_norm);
CREATE INDEX idx_customers_archived ON customers(archived_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE customer_tags (
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);
CREATE INDEX idx_customer_tags_tag ON customer_tags(tag_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  occurred_at TEXT NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  reversed_at TEXT,
  reversal_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tx_customer ON transactions(customer_id, occurred_at);
CREATE INDEX idx_tx_occurred ON transactions(occurred_at);

CREATE TABLE points_ledger (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  kind TEXT NOT NULL CHECK (kind IN ('earn','redeem','adjust','reversal','redeem_reversal')),
  ref_type TEXT,
  ref_id TEXT,
  reason TEXT,
  reverses_entry_id TEXT REFERENCES points_ledger(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_ledger_reverses ON points_ledger(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX idx_ledger_customer ON points_ledger(customer_id, created_at);
CREATE INDEX idx_ledger_ref ON points_ledger(ref_type, ref_id);

CREATE TABLE rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE reward_redemptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL REFERENCES rewards(id),
  reward_name TEXT NOT NULL,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  status TEXT NOT NULL DEFAULT 'redeemed' CHECK (status IN ('redeemed','cancelled')),
  redeemed_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancel_reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_redemptions_customer ON reward_redemptions(customer_id, redeemed_at);
CREATE INDEX idx_redemptions_reward ON reward_redemptions(reward_id);

CREATE TABLE vip_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_spend_minor INTEGER NOT NULL DEFAULT 0 CHECK (min_spend_minor >= 0),
  min_visits INTEGER NOT NULL DEFAULT 0 CHECK (min_visits >= 0),
  earn_multiplier_pct INTEGER NOT NULL DEFAULT 100 CHECK (earn_multiplier_pct >= 100),
  benefits TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rules TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  usage_limit_total INTEGER CHECK (usage_limit_total IS NULL OR usage_limit_total > 0),
  usage_limit_per_customer INTEGER CHECK (usage_limit_per_customer IS NULL OR usage_limit_per_customer > 0),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','segment','selected')),
  audience_key TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customer_offers (
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (offer_id, customer_id)
);

CREATE TABLE offer_redemptions (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'redeemed' CHECK (status IN ('redeemed','cancelled')),
  redeemed_at TEXT NOT NULL,
  note TEXT
);
CREATE INDEX idx_offer_redemptions_offer ON offer_redemptions(offer_id, customer_id);

CREATE TABLE message_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  language TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_templates_type ON message_templates(action_type, language);

CREATE TABLE smart_actions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  segment_id TEXT REFERENCES segments(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES message_templates(id) ON DELETE SET NULL,
  message_body TEXT,
  channel TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_smart_actions_created ON smart_actions(created_at);

CREATE TABLE customer_action_status (
  id TEXT PRIMARY KEY,
  smart_action_id TEXT NOT NULL REFERENCES smart_actions(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_contacted',
  reason TEXT,
  prepared_at TEXT,
  contacted_at TEXT,
  outcome_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (smart_action_id, customer_id)
);
CREATE INDEX idx_cas_customer ON customer_action_status(customer_id, updated_at);

CREATE TABLE follow_ups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  due_on TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  smart_action_id TEXT REFERENCES smart_actions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_followups_due ON follow_ups(status, due_on);
CREATE INDEX idx_followups_customer ON follow_ups(customer_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  details TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

CREATE TABLE license_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  license_text TEXT,
  license_id TEXT,
  activated_at TEXT,
  last_seen_ms INTEGER NOT NULL DEFAULT 0,
  clock_reviews INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`,
};
