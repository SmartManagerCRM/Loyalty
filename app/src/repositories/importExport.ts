import { DomainError } from "../database/db";
import type { AppContext } from "./context";
import { audit } from "./context";
import type { CustomersRepo } from "./customers";
import type { LoyaltyService } from "./loyalty";
import type { SettingsRepo } from "./settings";
import { ColumnMapping, parseCsv, parseLooseDate, toCsv, ParsedCsv } from "../domain/csv";
import { isValidEmail, normalizeEmail, normalizePhone, sanitizeText } from "../domain/phone";
import { parseMoney, minorToDecimalString } from "../domain/money";
import { isValidYmd } from "../domain/dates";
import type { CustomerInput } from "../domain/types";

export type RowStatus = "ok" | "duplicate" | "error";
export interface PreviewRow {
  line: number; // 1-based line in the source file (header = line 1)
  raw: string[];
  status: RowStatus;
  errors: string[];
  duplicateOf?: string;
  input?: CustomerInput;
  openingPoints: number;
  lastVisitOn: string | null;
  totalSpentMinor: number;
  code?: string;
  returnDays: number | null;
}
export interface ImportPreview {
  headers: string[];
  rows: PreviewRow[];
  counts: { ok: number; duplicate: number; error: number };
}

export class ImportExportService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo, private readonly customers: CustomersRepo, private readonly loyalty: LoyaltyService) {}

  parse(text: string): ParsedCsv {
    return parseCsv(text);
  }

  /** Validate every row and flag duplicates (against existing customers and earlier rows in the file). Nothing is written. */
  async preview(csv: ParsedCsv, mapping: ColumnMapping): Promise<ImportPreview> {
    if (mapping.name === undefined) throw new DomainError("mapping_name_required");
    const business = await this.settings.get("business");
    const currency = await this.settings.get("currency");
    const dateFmt = (await this.settings.get("locale")).dateFormat;
    const existing = await this.ctx.db.all<{ code: string; name: string; phone_norm: string | null; email_norm: string | null }>("SELECT code, name, phone_norm, email_norm FROM customers");
    const byPhone = new Map(existing.filter((e) => e.phone_norm).map((e) => [e.phone_norm!, e.name]));
    const byEmail = new Map(existing.filter((e) => e.email_norm).map((e) => [e.email_norm!, e.name]));
    const codes = new Set(existing.map((e) => e.code));
    const seenPhone = new Map<string, number>();
    const seenEmail = new Map<string, number>();
    const get = (r: string[], f: keyof ColumnMapping) => (mapping[f] === undefined ? "" : sanitizeText(r[mapping[f]!] ?? "", 2000));

    const rows: PreviewRow[] = csv.rows.map((raw, i) => {
      const errors: string[] = [];
      const line = i + 2;
      const name = get(raw, "name");
      const phoneRaw = get(raw, "phone");
      const emailRaw = get(raw, "email");
      if (!name) errors.push("name_required");
      const phoneNorm = phoneRaw ? normalizePhone(phoneRaw, business.countryCallingCode) : null;
      if (phoneRaw && !phoneNorm) errors.push("phone_invalid");
      if (emailRaw && !isValidEmail(emailRaw)) errors.push("email_invalid");
      let birthday: string | null = null;
      const bRaw = get(raw, "birthday");
      if (bRaw) {
        const mmdd = /^(\d{1,2})[-/](\d{1,2})$/.exec(bRaw);
        birthday = mmdd ? `--${mmdd[1]!.padStart(2, "0")}-${mmdd[2]!.padStart(2, "0")}` : parseLooseDate(bRaw, dateFmt);
        if (!birthday || (birthday.startsWith("--") ? !isValidYmd(`2000-${birthday.slice(2)}`) : !isValidYmd(birthday))) { errors.push("birthday_invalid"); birthday = null; }
      }
      const lvRaw = get(raw, "last_visit_date");
      const lastVisitOn = lvRaw ? parseLooseDate(lvRaw, dateFmt) : null;
      if (lvRaw && !lastVisitOn) errors.push("date_invalid");
      else if (lastVisitOn && lastVisitOn > new Date(this.ctx.now().getTime() + 86400000).toISOString().slice(0, 10)) errors.push("date_in_future");
      const tsRaw = get(raw, "total_spent");
      let totalSpentMinor = 0;
      if (tsRaw) {
        const m = parseMoney(tsRaw, currency.decimals);
        if (m === null) errors.push("amount_invalid");
        else totalSpentMinor = m;
      }
      const opRaw = get(raw, "opening_points");
      let openingPoints = 0;
      if (opRaw) {
        if (!/^\d{1,9}$/.test(opRaw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)))) errors.push("points_invalid");
        else openingPoints = Number(opRaw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
      }
      const rdRaw = get(raw, "return_days");
      let returnDays: number | null = null;
      if (rdRaw) {
        const n = Number(rdRaw.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)));
        if (!Number.isInteger(n) || n < 1 || n > 730) errors.push("return_interval_invalid");
        else returnDays = n;
      }
      const code = get(raw, "code");
      if (code && codes.has(code)) errors.push("code_exists");
      if (totalSpentMinor > 0 && !lastVisitOn) errors.push("spend_needs_date");

      const row: PreviewRow = { line, raw, status: "ok", errors, openingPoints, lastVisitOn, totalSpentMinor, code: code || undefined, returnDays };
      if (errors.length) { row.status = "error"; return row; }

      row.input = {
        name, phone: phoneRaw || null, email: emailRaw || null, birthday, notes: get(raw, "notes") || null,
        tags: get(raw, "tags").split(/[;|,]/).map((t) => t.trim()).filter(Boolean), returnIntervalDays: returnDays,
      };
      const emailNorm = normalizeEmail(emailRaw);
      const dupName = (phoneNorm && byPhone.get(phoneNorm)) || (emailNorm && byEmail.get(emailNorm));
      if (dupName) { row.status = "duplicate"; row.duplicateOf = dupName; }
      else if (phoneNorm && seenPhone.has(phoneNorm)) { row.status = "duplicate"; row.duplicateOf = `line ${seenPhone.get(phoneNorm)}`; }
      else if (emailNorm && seenEmail.has(emailNorm)) { row.status = "duplicate"; row.duplicateOf = `line ${seenEmail.get(emailNorm)}`; }
      if (phoneNorm && !seenPhone.has(phoneNorm)) seenPhone.set(phoneNorm, line);
      if (emailNorm && !seenEmail.has(emailNorm)) seenEmail.set(emailNorm, line);
      return row;
    });
    const counts = { ok: 0, duplicate: 0, error: 0 };
    for (const r of rows) counts[r.status]++;
    return { headers: csv.headers, rows, counts };
  }

  /**
   * Import validated rows in one transaction. Duplicates are skipped unless their line is in `importDuplicateLines`
   * (the owner explicitly chose to create a separate customer). Existing customers are never modified.
   */
  async commit(preview: ImportPreview, importDuplicateLines: Set<number> = new Set()): Promise<{ imported: number; skipped: number }> {
    this.ctx.assertWritable();
    await this.settings.all(); // warm the cache outside the transaction
    let imported = 0;
    let skipped = 0;
    await this.ctx.db.transaction(async (tx) => {
      for (const row of preview.rows) {
        const take = row.status === "ok" || (row.status === "duplicate" && importDuplicateLines.has(row.line));
        if (!take || !row.input) { skipped++; continue; }
        const c = await this.customers.create(row.input, { db: tx });
        if (row.code) await tx.run("UPDATE customers SET code = ? WHERE id = ?", [row.code, c.id]);
        await this.loyalty.importOpening(tx, { customerId: c.id, points: row.openingPoints, lastVisitOn: row.lastVisitOn, totalSpentMinor: row.totalSpentMinor });
        imported++;
      }
      await audit(tx, this.ctx, "import", null, "csv_import", { imported, skipped });
    });
    return { imported, skipped };
  }

  /** CSV of rejected rows with the reason, so the owner can fix and re-import. */
  errorReport(preview: ImportPreview, includeDuplicates = true): string {
    const bad = preview.rows.filter((r) => r.status === "error" || (includeDuplicates && r.status === "duplicate"));
    return toCsv(["line", "status", "reasons", ...preview.headers], bad.map((r) => [r.line, r.status, r.status === "duplicate" ? `duplicate of ${r.duplicateOf}` : r.errors.join("; "), ...r.raw]));
  }

  async exportCustomers(): Promise<string> {
    const [customers, balances, currency] = await Promise.all([this.customers.list({ includeArchived: true }), this.loyalty.balances(), this.settings.get("currency")]);
    const stats = await this.ctx.db.all<{ customer_id: string; n: number; spend: number; last: string | null }>(
      "SELECT customer_id, COUNT(*) AS n, SUM(amount_minor) AS spend, MAX(occurred_at) AS last FROM transactions WHERE status='active' GROUP BY customer_id");
    const sm = new Map(stats.map((s) => [s.customer_id, s]));
    return toCsv(
      ["code", "name", "phone", "email", "birthday", "tags", "preferred_channel", "consent", "points_balance", "purchases", "total_spent", "last_purchase", "notes", "archived", "created_at"],
      customers.map((c) => {
        const s = sm.get(c.id);
        return [c.code, c.name, c.phone ?? "", c.email ?? "", c.birthday ?? "", c.tags.join(";"), c.preferredChannel, c.consent, balances.get(c.id) ?? 0, s?.n ?? 0,
          minorToDecimalString(Number(s?.spend ?? 0), currency.decimals), s?.last ?? "", c.notes ?? "", c.archivedAt ? "yes" : "", c.createdAt];
      }),
    );
  }

  async exportTransactions(): Promise<string> {
    const currency = await this.settings.get("currency");
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT t.*, c.code, c.name FROM transactions t JOIN customers c ON c.id = t.customer_id ORDER BY t.occurred_at`);
    return toCsv(["date", "customer_code", "customer", "amount", "points_earned", "status", "source", "note", "reversal_reason"],
      rows.map((r) => [r.occurred_at, r.code, r.name, minorToDecimalString(Number(r.amount_minor), currency.decimals), r.points_earned, r.status, r.source, r.note ?? "", r.reversal_reason ?? ""]));
  }

  async exportLedger(): Promise<string> {
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT l.*, c.code, c.name FROM points_ledger l JOIN customers c ON c.id = l.customer_id ORDER BY l.created_at, l.rowid`);
    return toCsv(["date", "customer_code", "customer", "kind", "points", "reason"], rows.map((r) => [r.created_at, r.code, r.name, r.kind, r.delta, r.reason ?? ""]));
  }
}
