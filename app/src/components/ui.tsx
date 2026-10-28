import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId, useRef } from "react";
import { Link, LinkProps, useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, X, Info, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { useApp } from "../app/AppContext";

export function Chevron() {
  const { lang } = useApp();
  const Cmp = lang === "ar" ? ChevronLeft : ChevronRight;
  return <Cmp className="chev" aria-hidden />;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost" | "soft" | "default"; block?: boolean; sm?: boolean; write?: boolean; busy?: boolean };
/** `write` buttons are disabled while the license is not active (read-only mode). */
export function Button({ variant = "default", block, sm, write, busy, className = "", disabled, children, ...rest }: BtnProps) {
  const { canWrite } = useApp();
  const off = disabled || busy || (write && !canWrite);
  return (
    <button type="button" {...rest} disabled={off} className={`btn ${variant === "default" ? "" : variant} ${block ? "block" : ""} ${sm ? "sm" : ""} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ variant = "default", block, sm, className = "", ...rest }: LinkProps & { variant?: BtnProps["variant"]; block?: boolean; sm?: boolean }) {
  return <Link {...rest} className={`btn ${variant === "default" ? "" : variant} ${block ? "block" : ""} ${sm ? "sm" : ""} ${className}`} />;
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>{children}</button>;
}

export function BackButton() {
  const nav = useNavigate();
  const { t, lang } = useApp();
  const Cmp = lang === "ar" ? ChevronRight : ChevronLeft;
  return <IconButton label={t("common.back")} onClick={() => nav(-1)}><Cmp /></IconButton>;
}

export function Card({ children, className = "", flush }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={`card ${flush ? "flush" : ""} ${className}`}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err" role="alert">{error}</span> : null}
    </div>
  );
}

export function TextField({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><input id={id} className="input" aria-invalid={!!error} {...rest} /></Field>;
}

export function TextArea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><textarea id={id} className="input" aria-invalid={!!error} {...rest} /></Field>;
}

export function SelectField({ label, hint, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} htmlFor={id}><select id={id} className="input" {...rest}>{children}</select></Field>;
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <div className="search">
      <Search aria-hidden />
      <input className="input" type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Badge({ tone = "", children }: { tone?: "brand" | "warn" | "danger" | "info" | "gold" | ""; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Banner({ tone = "info", children, action }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`banner ${tone === "info" ? "" : tone}`} role={tone === "danger" ? "alert" : undefined}>
      <Icon aria-hidden />
      <div className="grow">{children}{action}</div>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty">{icon}<h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div>;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange(v: T): void }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`chip ${o.value === value ? "on" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined ? ` (${o.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone = "", to, sub }: { label: string; value: ReactNode; tone?: "warn" | "danger" | "brand" | "gold" | ""; to?: string; sub?: string }) {
  const inner = (<><span className="v num">{value}</span><span className="l">{label}</span>{sub ? <span className="tiny muted">{sub}</span> : null}</>);
  return to ? <Link to={to} className={`stat ${tone}`}>{inner}</Link> : <div className={`stat ${tone}`}>{inner}</div>;
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><IconButton label={t("common.close")} onClick={onClose}><X /></IconButton></header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmSheet({ title, text, confirmLabel, danger, onConfirm, onClose, children, disabled }: { title: string; text?: string; confirmLabel: string; danger?: boolean; onConfirm(): void | Promise<void>; onClose(): void; children?: ReactNode; disabled?: boolean }) {
  const { t } = useApp();
  return (
    <Sheet title={title} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant={danger ? "danger" : "primary"} disabled={disabled} onClick={() => void onConfirm()}>{confirmLabel}</Button></>}>
      {text ? <p>{text}</p> : null}
      {children}
    </Sheet>
  );
}

export function ListRow({ to, onClick, leading, title, sub, trailing, children }: { to?: string; onClick?: () => void; leading?: ReactNode; title: ReactNode; sub?: ReactNode; trailing?: ReactNode; children?: ReactNode }) {
  const body = (
    <>
      {leading}
      <div className="grow"><div className="strong ellipsis">{title}</div>{sub ? <div className="small muted">{sub}</div> : null}{children}</div>
      {trailing}
      {(to || onClick) && !trailing ? <Chevron /> : null}
    </>
  );
  return to ? <Link to={to} className="list-row">{body}</Link> : <button type="button" className="list-row" onClick={onClick} disabled={!onClick}>{body}</button>;
}

export function Initials({ name, gold }: { name: string }&{ gold?: boolean }) {
  const parts = name.trim().split(/\s+/);
  const txt = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
  return <span className={`avatar ${gold ? "gold" : ""}`} aria-hidden>{txt || "?"}</span>;
}

export function Toasts() {
  const { toasts } = useApp();
  return <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className={`toast ${x.error ? "error" : ""}`}>{x.text}</div>)}</div>;
}

/** Simple readable bar chart (SVG) from real values. */
export function BarChart({ data, secondary, labelEvery = 1, ariaLabel }: { data: { label: string; value: number }[]; secondary?: number[]; labelEvery?: number; ariaLabel: string }) {
  const w = 320, h = 140, pad = 18;
  const max = Math.max(1, ...data.map((d) => d.value), ...(secondary ?? [0]));
  const bw = (w - pad) / Math.max(1, data.length);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <line x1={pad} x2={w} y1={h} y2={h} stroke="currentColor" opacity=".2" />
      {data.map((d, i) => {
        const bh = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * (h - 12));
        const sh = secondary ? Math.max(secondary[i]! > 0 ? 2 : 0, (secondary[i]! / max) * (h - 12)) : 0;
        const x = pad + i * bw;
        return (
          <g key={i}>
            <rect className="bar" x={x + bw * 0.12} width={Math.max(1, bw * (secondary ? 0.38 : 0.76))} y={h - bh} height={bh} rx="2"><title>{`${d.label}: ${d.value}`}</title></rect>
            {secondary ? <rect className="bar2" x={x + bw * 0.5} width={Math.max(1, bw * 0.38)} y={h - sh} height={sh} rx="2" /> : null}
            {i % labelEvery === 0 ? <text x={x + bw / 2} y={h + 13} textAnchor="middle">{d.label}</text> : null}
          </g>
        );
      })}
      <text x="0" y="10">{max}</text>
    </svg>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="row between">
      <div className="grow"><h2 style={{ fontSize: "1.3rem" }}>{title}</h2>{subtitle ? <p className="muted small">{subtitle}</p> : null}</div>
      {actions}
    </div>
  );
}
