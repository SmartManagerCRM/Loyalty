import Papa from "papaparse";
import { sanitizeText } from "./phone";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const all = (res.data as string[][]).map((r) => r.map((c) => String(c ?? "")));
  const headers = (all[0] ?? []).map((h) => sanitizeText(h, 80));
  return { headers, rows: all.slice(1) };
}

export const IMPORT_FIELDS = ["name", "phone", "email", "birthday", "code", "notes", "tags", "opening_points", "last_visit_date", "total_spent"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "full name", "customer", "customer name", "client", "الاسم", "اسم العميل", "العميل"],
  phone: ["phone", "mobile", "tel", "telephone", "whatsapp", "cell", "phone number", "mobile number", "الجوال", "الهاتف", "رقم الجوال", "رقم الهاتف", "الموبايل"],
  email: ["email", "e-mail", "mail", "email address", "البريد", "البريد الإلكتروني"],
  birthday: ["birthday", "birth date", "dob", "date of birth", "تاريخ الميلاد", "عيد الميلاد"],
  code: ["code", "customer code", "id", "customer id", "رقم العميل", "الكود"],
  notes: ["notes", "note", "comments", "remarks", "ملاحظات"],
  tags: ["tags", "tag", "groups", "labels", "الوسوم"],
  opening_points: ["points", "opening points", "points balance", "loyalty points", "النقاط", "رصيد النقاط"],
  last_visit_date: ["last visit", "last visit date", "last purchase", "last purchase date", "آخر زيارة", "تاريخ آخر زيارة"],
  total_spent: ["total spent", "total spend", "lifetime spend", "spent", "إجمالي المشتريات", "إجمالي الإنفاق"],
};

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && SYNONYMS[field].includes(h.trim().toLowerCase()));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Escape a CSV cell and neutralize spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Parse many common date inputs to YYYY-MM-DD, or null. Ambiguous d/m/y vs m/d/y uses the hint. */
export function parseLooseDate(raw: string, hint: "DMY" | "MDY" | "YMD" = "DMY"): string | null {
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
  if (!s) return null;
  let y: number, m: number, d: number;
  let mt = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (mt) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) {
    const a = Number(mt[1]);
    const b = Number(mt[2]);
    y = Number(mt[3]);
    if (a > 12) { d = a; m = b; }
    else if (b > 12) { m = a; d = b; }
    else if (hint === "MDY") { m = a; d = b; }
    else { d = a; m = b; }
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
