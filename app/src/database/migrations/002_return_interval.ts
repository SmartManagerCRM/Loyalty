import type { Migration } from "./index";

export const m002: Migration = {
  version: 2,
  name: "per-customer return period",
  sql: `
ALTER TABLE customers ADD COLUMN return_interval_days INTEGER CHECK (return_interval_days IS NULL OR (return_interval_days >= 1 AND return_interval_days <= 730))
`,
};
