import { en } from "./en";
import { ar } from "./ar";
import { fr } from "./fr";
import type { Language, DateFormat } from "../domain/settings";

export type Dict = Record<string, string>;
export const DICTIONARIES: Record<string, Dict> = { en, ar, fr };
/** To add another language: create xx.ts exporting a Dict, register it here and in LANGUAGES / the Language type. Missing keys fall back to English. */
export const LANGUAGES: { code: Language; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "fr", label: "Français", dir: "ltr" },
];

export function translate(lang: string, key: string, params?: Record<string, string | number>): string {
  const raw = DICTIONARIES[lang]?.[key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}

export type TFn = (key: string, params?: Record<string, string | number>) => string;

export function formatYmd(ymd: string, fmt: DateFormat): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return fmt === "YMD" ? `${y}-${m}-${d}` : fmt === "MDY" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

export function formatInstant(iso: string, fmt: DateFormat, withTime = false): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  const base = formatYmd(ymd, fmt);
  return withTime ? `${base} ${p(dt.getHours())}:${p(dt.getMinutes())}` : base;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en", { numberingSystem: "latn", maximumFractionDigits: 0 }).format(n);
}
