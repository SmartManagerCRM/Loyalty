import type { Db } from "../database/db";
import { DomainError } from "../database/db";
import { audit, AppContext, requireText, uuid } from "./context";
import type { SettingsRepo } from "./settings";
import type { InsightsService } from "./insights";
import { Candidate, CustomerInsight, evaluateEligibility, rankCandidates } from "../domain/scoring";
import { sanitizeText } from "../domain/phone";
import { isValidYmd } from "../domain/dates";
import { ACTION_TYPES, ActionType, BUILT_IN_STATUSES, FollowUp, MessageTemplate, Reason, Segment, SegmentRules } from "../domain/types";
import { DEFAULT_TEMPLATES } from "../domain/templates";

export interface EligibleRow {
  insight: CustomerInsight;
  candidate: Candidate;
}

export interface ActionRun {
  id: string;
  type: ActionType;
  name: string;
  templateId: string | null;
  messageBody: string | null;
  channel: string | null;
  createdAt: string;
  counts: Record<string, number>;
  total: number;
}

export interface RunMember {
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  reasons: Reason[];
  preparedAt: string | null;
  contactedAt: string | null;
  outcomeAt: string | null;
  note: string | null;
}

export class ActionsService {
  constructor(private readonly ctx: AppContext, private readonly settings: SettingsRepo, private readonly insights: InsightsService) {}

  // ───────────── eligibility ─────────────
  async eligible(type: ActionType, opts: { segmentId?: string; insights?: CustomerInsight[] } = {}): Promise<EligibleRow[]> {
    const scoring = await this.settings.get("scoring");
    const all = opts.insights ?? (await this.insights.loadAll());
    let rules: SegmentRules | undefined;
    if (type === "custom") {
      const seg = opts.segmentId ? await this.segment(opts.segmentId) : null;
      if (!seg) return [];
      rules = seg.rules;
    }
    const rows: EligibleRow[] = [];
    for (const insight of all) {
      const candidate = evaluateEligibility(type, insight, scoring, rules);
      if (candidate) rows.push({ insight, candidate });
    }
    const order = new Map(rankCandidates(rows.map((r) => r.candidate)).map((c, i) => [c.customerId, i]));
    return rows.sort((a, b) => order.get(a.candidate.customerId)! - order.get(b.candidate.customerId)!);
  }

  async countsByType(insights?: CustomerInsight[]): Promise<Record<ActionType, number>> {
    const all = insights ?? (await this.insights.loadAll());
    const out = {} as Record<ActionType, number>;
    for (const t of ACTION_TYPES) out[t] = t === "custom" ? 0 : (await this.eligible(t, { insights: all })).filter((r) => !r.candidate.blocked).length;
    return out;
  }

  // ───────────── runs & outcomes ─────────────
  async startRun(input: { type: ActionType; name: string; segmentId?: string | null; templateId?: string | null; messageBody: string; channel: string; members: { customerId: string; reasons: Reason[] }[] }): Promise<string> {
    this.ctx.assertWritable();
    if (!input.members.length) throw new DomainError("select_customers");
    const id = uuid();
    const now = this.ctx.now().toISOString();
    await this.ctx.db.transaction(async (tx) => {
      // enforce Do Not Contact in business logic, not just in the UI
      for (const m of input.members) {
        const c = await tx.get<{ consent_status: string }>("SELECT consent_status FROM customers WHERE id = ?", [m.customerId]);
        if (!c) throw new DomainError("not_found");
        if (c.consent_status === "do_not_contact") throw new DomainError("do_not_contact");
      }
      await tx.run("INSERT INTO smart_actions (id, type, name, segment_id, template_id, message_body, channel, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [id, input.type, requireText(sanitizeText(input.name, 120), "name_required", 120), input.segmentId ?? null, input.templateId ?? null, input.messageBody, input.channel, now]);
      for (const m of input.members) {
        await tx.run("INSERT INTO customer_action_status (id, smart_action_id, customer_id, status, reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
          [uuid(), id, m.customerId, "not_contacted", JSON.stringify(m.reasons), now, now]);
      }
      await audit(tx, this.ctx, "smart_action", id, "create", { type: input.type, count: input.members.length });
    });
    return id;
  }

  async validStatus(status: string): Promise<boolean> {
    if ((BUILT_IN_STATUSES as string[]).includes(status)) return true;
    if (!status.startsWith("custom:")) return false;
    return (await this.settings.get("customOutcomes")).includes(status.slice(7));
  }

  async setStatus(actionId: string, customerId: string, status: string, note?: string | null): Promise<void> {
    this.ctx.assertWritable();
    if (!(await this.validStatus(status))) throw new DomainError("status_invalid");
    const now = this.ctx.now().toISOString();
    await this.ctx.db.transaction(async (tx) => {
      const row = await tx.get<{ id: string; prepared_at: string | null; contacted_at: string | null }>(
        "SELECT id, prepared_at, contacted_at FROM customer_action_status WHERE smart_action_id=? AND customer_id=?", [actionId, customerId]);
      if (!row) throw new DomainError("not_found");
      const prepared = row.prepared_at ?? (status === "not_contacted" ? null : now);
      const contacted = row.contacted_at ?? (["contacted", "replied", "returned", "not_interested"].includes(status) || status.startsWith("custom:") ? now : null);
      const outcome = ["replied", "returned", "not_interested"].includes(status) || status.startsWith("custom:") ? now : null;
      await tx.run("UPDATE customer_action_status SET status=?, prepared_at=?, contacted_at=?, outcome_at=?, note=COALESCE(?, note), updated_at=? WHERE id=?",
        [status, prepared, contacted, outcome, note ? sanitizeText(note, 500) : null, now, row.id]);
      await audit(tx, this.ctx, "customer_action_status", row.id, "status", { status });
    });
  }

  async markPrepared(actionId: string, customerId: string): Promise<void> {
    this.ctx.assertWritable();
    const now = this.ctx.now().toISOString();
    await this.ctx.db.run(
      "UPDATE customer_action_status SET prepared_at = COALESCE(prepared_at, ?), status = CASE WHEN status='not_contacted' THEN 'prepared' ELSE status END, updated_at=? WHERE smart_action_id=? AND customer_id=?",
      [now, now, actionId, customerId]);
  }

  async runs(limit = 50): Promise<ActionRun[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>("SELECT * FROM smart_actions ORDER BY created_at DESC, rowid DESC LIMIT ?", [limit]);
    const counts = await this.ctx.db.all<{ smart_action_id: string; status: string; n: number }>("SELECT smart_action_id, status, COUNT(*) AS n FROM customer_action_status GROUP BY smart_action_id, status");
    return rows.map((r) => {
      const c: Record<string, number> = {};
      let total = 0;
      for (const x of counts.filter((x) => x.smart_action_id === r.id)) {
        c[x.status] = Number(x.n);
        total += Number(x.n);
      }
      return { id: r.id as string, type: r.type as ActionType, name: r.name as string, templateId: (r.template_id as string) ?? null, messageBody: (r.message_body as string) ?? null, channel: (r.channel as string) ?? null, createdAt: r.created_at as string, counts: c, total };
    });
  }

  async run(id: string): Promise<{ run: ActionRun; members: RunMember[] } | null> {
    const run = (await this.runs(500)).find((r) => r.id === id);
    if (!run) return null;
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT s.*, c.name AS customer_name FROM customer_action_status s JOIN customers c ON c.id = s.customer_id WHERE s.smart_action_id = ? ORDER BY c.name COLLATE NOCASE`, [id]);
    return {
      run,
      members: rows.map((r) => ({
        id: r.id as string, customerId: r.customer_id as string, customerName: r.customer_name as string, status: r.status as string,
        reasons: safeReasons(r.reason as string | null), preparedAt: (r.prepared_at as string) ?? null, contactedAt: (r.contacted_at as string) ?? null,
        outcomeAt: (r.outcome_at as string) ?? null, note: (r.note as string) ?? null,
      })),
    };
  }

  /** Recent outreach for one customer (for the profile). */
  async historyFor(customerId: string): Promise<{ actionId: string; name: string; type: ActionType; status: string; at: string }[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT s.smart_action_id, a.name, a.type, s.status, s.updated_at FROM customer_action_status s JOIN smart_actions a ON a.id = s.smart_action_id WHERE s.customer_id = ? ORDER BY s.updated_at DESC LIMIT 50`, [customerId]);
    return rows.map((r) => ({ actionId: r.smart_action_id as string, name: r.name as string, type: r.type as ActionType, status: r.status as string, at: r.updated_at as string }));
  }

  // ───────────── follow-ups ─────────────
  async addFollowUp(input: { customerId: string; dueOn: string; note?: string | null; smartActionId?: string | null }, db: Db = this.ctx.db): Promise<string> {
    this.ctx.assertWritable();
    if (!isValidYmd(input.dueOn)) throw new DomainError("date_invalid");
    const c = await db.get("SELECT 1 AS x FROM customers WHERE id = ?", [input.customerId]);
    if (!c) throw new DomainError("not_found");
    const id = uuid();
    await db.run("INSERT INTO follow_ups (id, customer_id, due_on, note, status, smart_action_id, created_at) VALUES (?,?,?,?, 'open', ?, ?)",
      [id, input.customerId, input.dueOn, input.note ? sanitizeText(input.note, 500) : null, input.smartActionId ?? null, this.ctx.now().toISOString()]);
    return id;
  }

  async setFollowUpStatus(id: string, status: "done" | "dismissed" | "open"): Promise<void> {
    this.ctx.assertWritable();
    const r = await this.ctx.db.run("UPDATE follow_ups SET status=?, completed_at=? WHERE id=?", [status, status === "open" ? null : this.ctx.now().toISOString(), id]);
    if (!r.changes) throw new DomainError("not_found");
  }

  async followUps(opts: { status?: "open" | "done" | "dismissed"; customerId?: string; limit?: number } = {}): Promise<(FollowUp & { customerName: string })[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.status) { where.push("f.status = ?"); params.push(opts.status); }
    if (opts.customerId) { where.push("f.customer_id = ?"); params.push(opts.customerId); }
    params.push(opts.limit ?? 300);
    const rows = await this.ctx.db.all<Record<string, unknown>>(
      `SELECT f.*, c.name AS customer_name FROM follow_ups f JOIN customers c ON c.id = f.customer_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY f.due_on, f.created_at LIMIT ?`, params);
    return rows.map((r) => ({
      id: r.id as string, customerId: r.customer_id as string, dueOn: r.due_on as string, note: (r.note as string) ?? null,
      status: r.status as FollowUp["status"], smartActionId: (r.smart_action_id as string) ?? null, createdAt: r.created_at as string,
      completedAt: (r.completed_at as string) ?? null, customerName: r.customer_name as string,
    }));
  }

  // ───────────── templates ─────────────
  async templates(opts: { type?: ActionType; language?: string } = {}): Promise<MessageTemplate[]> {
    const where: string[] = ["active = 1"];
    const params: string[] = [];
    if (opts.type) { where.push("action_type = ?"); params.push(opts.type); }
    if (opts.language) { where.push("language = ?"); params.push(opts.language); }
    const rows = await this.ctx.db.all<Record<string, unknown>>(`SELECT * FROM message_templates WHERE ${where.join(" AND ")} ORDER BY is_default DESC, name COLLATE NOCASE`, params);
    return rows.map(toTemplate);
  }

  async saveTemplate(input: { id?: string; name: string; actionType: ActionType; language: string; body: string }): Promise<string> {
    this.ctx.assertWritable();
    const name = requireText(sanitizeText(input.name, 80), "name_required", 80);
    const body = requireText(input.body.replace(/\r\n/g, "\n").slice(0, 1000), "body_required", 1000);
    const id = input.id ?? uuid();
    const now = this.ctx.now().toISOString();
    if (input.id) {
      const r = await this.ctx.db.run("UPDATE message_templates SET name=?, action_type=?, language=?, body=?, updated_at=? WHERE id=?", [name, input.actionType, input.language, body, now, id]);
      if (!r.changes) throw new DomainError("not_found");
    } else {
      await this.ctx.db.run("INSERT INTO message_templates (id, name, action_type, language, body, is_default, active, created_at, updated_at) VALUES (?,?,?,?,?,0,1,?,?)", [id, name, input.actionType, input.language, body, now, now]);
    }
    return id;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.run("DELETE FROM message_templates WHERE id = ?", [id]);
  }

  async seedDefaultTemplates(): Promise<void> {
    const existing = await this.ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM message_templates");
    if (Number(existing!.n) > 0) return;
    const now = this.ctx.now().toISOString();
    await this.ctx.db.transaction(async (tx) => {
      for (const t of DEFAULT_TEMPLATES) {
        await tx.run("INSERT INTO message_templates (id, name, action_type, language, body, is_default, active, created_at, updated_at) VALUES (?,?,?,?,?,1,1,?,?)", [uuid(), t.name, t.type, t.lang, t.body, now, now]);
      }
    });
  }

  // ───────────── segments ─────────────
  async segments(): Promise<Segment[]> {
    const rows = await this.ctx.db.all<Record<string, unknown>>("SELECT * FROM segments WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE");
    return rows.map(toSegment);
  }
  async segment(id: string): Promise<Segment | null> {
    const r = await this.ctx.db.get<Record<string, unknown>>("SELECT * FROM segments WHERE id = ?", [id]);
    return r ? toSegment(r) : null;
  }
  async saveSegment(input: { id?: string; name: string; rules: SegmentRules }): Promise<string> {
    this.ctx.assertWritable();
    const name = requireText(sanitizeText(input.name, 80), "name_required", 80);
    const id = input.id ?? uuid();
    const now = this.ctx.now().toISOString();
    if (input.id) {
      const r = await this.ctx.db.run("UPDATE segments SET name=?, rules=?, updated_at=? WHERE id=?", [name, JSON.stringify(input.rules), now, id]);
      if (!r.changes) throw new DomainError("not_found");
    } else {
      await this.ctx.db.run("INSERT INTO segments (id, name, rules, created_at, updated_at) VALUES (?,?,?,?,?)", [id, name, JSON.stringify(input.rules), now, now]);
    }
    return id;
  }
  async archiveSegment(id: string): Promise<void> {
    this.ctx.assertWritable();
    await this.ctx.db.run("UPDATE segments SET archived_at=? WHERE id=?", [this.ctx.now().toISOString(), id]);
  }
}

function toTemplate(r: Record<string, unknown>): MessageTemplate {
  return { id: r.id as string, name: r.name as string, actionType: r.action_type as ActionType, language: r.language as string, body: r.body as string, isDefault: !!r.is_default, active: !!r.active };
}
function toSegment(r: Record<string, unknown>): Segment {
  let rules: SegmentRules = {};
  try { rules = JSON.parse(r.rules as string) as SegmentRules; } catch { /* empty rules */ }
  return { id: r.id as string, name: r.name as string, rules, archivedAt: (r.archived_at as string) ?? null };
}
function safeReasons(s: string | null): Reason[] {
  try { return s ? (JSON.parse(s) as Reason[]) : []; } catch { return []; }
}
