import type { Db } from "../database/db";
import { DomainError } from "../database/db";
import { audit, AppContext, requireText, uuid } from "./context";
import type { Channel, Consent, Customer, CustomerInput } from "../domain/types";
import { isValidEmail, normalizeEmail, normalizePhone, sanitizeText } from "../domain/phone";
import { isValidYmd } from "../domain/dates";
import type { SettingsRepo } from "./settings";

interface Row {
  id: string; code: string; name: string; phone: string | null; phone_norm: string | null; email: string | null; birthday: string | null;
  notes: string | null; preferred_channel: Channel; consent_status: Consent; custom_fields: string; archived_at: string | null;
  created_at: string; updated_at: string; return_interval_days: number | null;
}

const COLS = "id, code, name, phone, phone_norm, email, birthday, notes, preferred_channel, consent_status, custom_fields, archived_at, created_at, updated_at, return_interval_days";

export interface DuplicateMatch {
  customer: Customer;
  matchedOn: ("phone" | "email" | "name")[];
}

export class CustomersRepo {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo) {}

  private async hydrate(db: Db, rows: Row[]): Promise<Customer[]> {
    if (rows.length === 0) return [];
    const tagRows = await db.all<{ customer_id: string; name: string }>(
      `SELECT ct.customer_id, t.name FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name COLLATE NOCASE`,
    );
    const byCustomer = new Map<string, string[]>();
    for (const t of tagRows) (byCustomer.get(t.customer_id) ?? byCustomer.set(t.customer_id, []).get(t.customer_id)!).push(t.name);
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, phone: r.phone, phoneNorm: r.phone_norm, email: r.email, birthday: r.birthday, notes: r.notes,
      preferredChannel: r.preferred_channel, consent: r.consent_status, customFields: safeJson(r.custom_fields), returnIntervalDays: r.return_interval_days ?? null,
      tags: byCustomer.get(r.id) ?? [], archivedAt: r.archived_at, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async get(id: string, db: Db = this.ctx.db): Promise<Customer | null> {
    const row = await db.get<Row>(`SELECT ${COLS} FROM customers WHERE id = ?`, [id]);
    if (!row) return null;
    const tags = await db.all<{ name: string }>(
      "SELECT t.name FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = ? ORDER BY t.name COLLATE NOCASE", [id]);
    return { ...(await this.hydrateOne(row)), tags: tags.map((t) => t.name) };
  }

  private async hydrateOne(r: Row): Promise<Customer> {
    return {
      id: r.id, code: r.code, name: r.name, phone: r.phone, phoneNorm: r.phone_norm, email: r.email, birthday: r.birthday, notes: r.notes,
      preferredChannel: r.preferred_channel, consent: r.consent_status, customFields: safeJson(r.custom_fields), returnIntervalDays: r.return_interval_days ?? null, tags: [],
      archivedAt: r.archived_at, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  /** All customers (optionally including archived), with tags. Search matches name, phone digits, email and code. */
  async list(opts: { search?: string; includeArchived?: boolean; onlyArchived?: boolean } = {}): Promise<Customer[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.onlyArchived) where.push("archived_at IS NOT NULL");
    else if (!opts.includeArchived) where.push("archived_at IS NULL");
    const q = opts.search?.trim();
    if (q) {
      const like = `%${q.toLowerCase().replace(/[%_\\]/g, (m) => "\\" + m)}%`;
      const digits = normalizePhone(q.replace(/[^\d+]/g, "")) ?? q.replace(/\D/g, "");
      const parts = ["LOWER(name) LIKE ? ESCAPE '\\'", "LOWER(code) LIKE ? ESCAPE '\\'", "LOWER(COALESCE(email,'')) LIKE ? ESCAPE '\\'"];
      params.push(like, like, like);
      if (digits.length >= 3) {
        parts.push("COALESCE(phone_norm,'') LIKE ?");
        params.push(`%${digits}%`);
      }
      where.push(`(${parts.join(" OR ")})`);
    }
    const rows = await this.ctx.db.all<Row>(`SELECT ${COLS} FROM customers ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name COLLATE NOCASE`, params);
    return this.hydrate(this.ctx.db, rows);
  }

  async count(): Promise<number> {
    return (await this.ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM customers WHERE archived_at IS NULL"))!.n;
  }

  /** Validate without saving; returns an error code or null. Used by CSV import preview. */
  async check(input: CustomerInput): Promise<string | null> {
    try {
      await this.validate(input, (await this.settings.get("business")).countryCallingCode);
      return null;
    } catch (e) {
      return e instanceof DomainError ? e.code : "invalid";
    }
  }

  private async validate(input: CustomerInput, countryCode: string) {
    const name = requireText(sanitizeText(input.name, 120), "name_required", 120);
    const phone = input.phone ? sanitizeText(input.phone, 40) : null;
    const phoneNorm = phone ? normalizePhone(phone, countryCode) : null;
    if (phone && !phoneNorm) throw new DomainError("phone_invalid");
    const email = input.email ? sanitizeText(input.email, 160) : null;
    if (email && !isValidEmail(email)) throw new DomainError("email_invalid");
    const birthday = input.birthday ? sanitizeText(input.birthday, 12) : null;
    if (birthday) {
      if (/^--\d{2}-\d{2}$/.test(birthday)) {
        if (!isValidYmd(`2000-${birthday.slice(2)}`)) throw new DomainError("birthday_invalid");
      } else if (!isValidYmd(birthday)) throw new DomainError("birthday_invalid");
    }
    let returnIntervalDays: number | null = null;
    if (input.returnIntervalDays !== undefined && input.returnIntervalDays !== null) {
      if (!Number.isInteger(input.returnIntervalDays) || input.returnIntervalDays < 1 || input.returnIntervalDays > 730) throw new DomainError("return_interval_invalid");
      returnIntervalDays = input.returnIntervalDays;
    }
    const customFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.customFields ?? {})) {
      const val = sanitizeText(v, 200);
      if (val) customFields[sanitizeText(k, 40)] = val;
    }
    return {
      name, phone, phoneNorm, email, emailNorm: normalizeEmail(email), birthday, notes: input.notes ? sanitizeText(input.notes, 2000) : null,
      channel: input.preferredChannel ?? "whatsapp", consent: input.consent ?? "unknown", customFields, returnIntervalDays,
      tags: [...new Set((input.tags ?? []).map((t) => sanitizeText(t, 40)).filter(Boolean))],
    };
  }

  async findDuplicates(input: { name?: string; phone?: string | null; email?: string | null }, excludeId?: string): Promise<DuplicateMatch[]> {
    const cc = (await this.settings.get("business")).countryCallingCode;
    const phoneNorm = input.phone ? normalizePhone(input.phone, cc) : null;
    const emailNorm = normalizeEmail(input.email);
    const nameNorm = input.name?.trim().toLowerCase() ?? "";
    const conds: string[] = [];
    const params: string[] = [];
    if (phoneNorm) { conds.push("phone_norm = ?"); params.push(phoneNorm); }
    if (emailNorm) { conds.push("email_norm = ?"); params.push(emailNorm); }
    if (nameNorm.length >= 3) { conds.push("LOWER(name) = ?"); params.push(nameNorm); }
    if (!conds.length) return [];
    const rows = await this.ctx.db.all<Row>(`SELECT ${COLS} FROM customers WHERE (${conds.join(" OR ")})${excludeId ? " AND id <> ?" : ""}`, excludeId ? [...params, excludeId] : params);
    const customers = await this.hydrate(this.ctx.db, rows);
    return customers.map((c) => ({
      customer: c,
      matchedOn: [
        ...(phoneNorm && c.phoneNorm === phoneNorm ? (["phone"] as const) : []),
        ...(emailNorm && c.email?.toLowerCase() === emailNorm ? (["email"] as const) : []),
        ...(nameNorm.length >= 3 && c.name.toLowerCase() === nameNorm ? (["name"] as const) : []),
      ],
    }));
  }

  private async nextCode(tx: Db): Promise<string> {
    // read straight from the DB (not the settings cache): the cache is not rolled back with a transaction
    const row = await tx.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'nextCustomerNumber'");
    let n = row ? Number(JSON.parse(row.value)) || 1 : 1;
    // guard against collisions (e.g. after imports/restores)
    for (;;) {
      const code = `C-${String(n).padStart(4, "0")}`;
      const clash = await tx.get("SELECT 1 AS x FROM customers WHERE code = ?", [code]);
      if (!clash) {
        await tx.run(
          "INSERT INTO app_settings (key, value, updated_at) VALUES ('nextCustomerNumber', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          [JSON.stringify(n + 1), this.ctx.now().toISOString()],
        );
        this.settings.invalidate();
        return code;
      }
      n++;
    }
  }

  private async syncTags(tx: Db, customerId: string, tags: string[]) {
    await tx.run("DELETE FROM customer_tags WHERE customer_id = ?", [customerId]);
    for (const name of tags) {
      let tag = await tx.get<{ id: string }>("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", [name]);
      if (!tag) {
        tag = { id: uuid() };
        await tx.run("INSERT INTO tags (id, name) VALUES (?,?)", [tag.id, name]);
      }
      await tx.run("INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?,?)", [customerId, tag.id]);
    }
    await tx.run("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)");
  }

  async create(input: CustomerInput, opts: { db?: Db; skipAssert?: boolean } = {}): Promise<Customer> {
    if (!opts.skipAssert) this.ctx.assertWritable();
    const cc = (await this.settings.get("business", opts.db)).countryCallingCode;
    const v = await this.validate(input, cc);
    const id = uuid();
    const now = this.ctx.now().toISOString();
    const run = async (tx: Db) => {
      const code = await this.nextCode(tx);
      await tx.run(
        `INSERT INTO customers (id, code, name, phone, phone_norm, email, email_norm, birthday, notes, preferred_channel, consent_status, custom_fields, created_at, updated_at, return_interval_days)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, code, v.name, v.phone, v.phoneNorm, v.email, v.emailNorm, v.birthday, v.notes, v.channel, v.consent, JSON.stringify(v.customFields), now, now, v.returnIntervalDays],
      );
      await this.syncTags(tx, id, v.tags);
      await audit(tx, this.ctx, "customer", id, "create", { code });
      return (await this.get(id, tx))!;
    };
    return opts.db ? run(opts.db) : this.ctx.db.transaction(run);
  }

  async update(id: string, input: CustomerInput): Promise<Customer> {
    this.ctx.assertWritable();
    const cc = (await this.settings.get("business")).countryCallingCode;
    const v = await this.validate(input, cc);
    return this.ctx.db.transaction(async (tx) => {
      if (!(await this.get(id, tx))) throw new DomainError("not_found");
      await tx.run(
        `UPDATE customers SET name=?, phone=?, phone_norm=?, email=?, email_norm=?, birthday=?, notes=?, preferred_channel=?, consent_status=?, custom_fields=?, updated_at=?, return_interval_days=? WHERE id=?`,
        [v.name, v.phone, v.phoneNorm, v.email, v.emailNorm, v.birthday, v.notes, v.channel, v.consent, JSON.stringify(v.customFields), this.ctx.now().toISOString(), v.returnIntervalDays, id],
      );
      await this.syncTags(tx, id, v.tags);
      await audit(tx, this.ctx, "customer", id, "update");
      return (await this.get(id, tx))!;
    });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.transaction(async (tx) => {
      const r = await tx.run("UPDATE customers SET archived_at = ?, updated_at = ? WHERE id = ?", [archived ? this.ctx.now().toISOString() : null, this.ctx.now().toISOString(), id]);
      if (!r.changes) throw new DomainError("not_found");
      await audit(tx, this.ctx, "customer", id, archived ? "archive" : "unarchive");
    });
  }

  /** Permanently deletes a customer and all linked history (privacy control). Audit keeps only the code. */
  async deletePermanently(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.transaction(async (tx) => {
      const c = await this.get(id, tx);
      if (!c) throw new DomainError("not_found");
      await tx.run("DELETE FROM customer_action_status WHERE customer_id = ?", [id]);
      await tx.run("DELETE FROM offer_redemptions WHERE customer_id = ?", [id]);
      await tx.run("DELETE FROM customers WHERE id = ?", [id]);
      await tx.run("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM customer_tags)");
      await audit(tx, this.ctx, "customer", id, "delete_permanent", { code: c.code });
    });
  }

  async allTags(): Promise<string[]> {
    return (await this.ctx.db.all<{ name: string }>("SELECT name FROM tags ORDER BY name COLLATE NOCASE")).map((t) => t.name);
  }
}

function safeJson(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
