import React from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { C } from "./theme";
import Logo from "./Logo";

export function Btn({ children, onClick, variant = "primary", icon: Icon, className = "", type = "button", disabled }) {
  const styles = {
    primary: { backgroundColor: C.green, color: C.white, border: "none" },
    secondary: { backgroundColor: C.white, color: C.navy, border: `1px solid ${C.border}` },
    danger: { backgroundColor: C.white, color: C.red, border: `1px solid ${C.red}` },
    ghost: { backgroundColor: "transparent", color: C.navy, border: "none" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={styles[variant]}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function IconButton({ onClick, title, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 transition-colors"
      style={{ color: danger ? C.red : C.slate }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, span }) {
  return (
    <label className={`flex flex-col gap-1 ${span ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold" style={{ color: C.slate }}>{label}</span>
      {children}
    </label>
  );
}

function inputBase() {
  return "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 transition-shadow";
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={`${inputBase()} ${props.className || ""}`}
      style={{ borderColor: C.border, ...(props.style || {}) }}
    />
  );
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`${inputBase()} min-h-[80px] ${props.className || ""}`}
      style={{ borderColor: C.border, ...(props.style || {}) }}
    />
  );
}

export function Select({ options, ...props }) {
  return (
    <select {...props} className={`${inputBase()} bg-white ${props.className || ""}`} style={{ borderColor: C.border }}>
      {options.map((opt) => (
        <option key={opt.value ?? opt} value={opt.value ?? opt}>
          {opt.label ?? opt}
        </option>
      ))}
    </select>
  );
}

export function Pill({ children, color = C.slate, bg = C.bg }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color, backgroundColor: bg }}
    >
      {children}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold" style={{ color: C.ink }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDelete({ label, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <Modal title={t("common.deleteConfirmTitle", { label })} onClose={onCancel}>
      <p className="mb-5 text-sm" style={{ color: C.slate }}>{t("common.deleteConfirmBody")}</p>
      <div className="flex justify-end gap-2">
        <Btn variant="secondary" onClick={onCancel}>{t("common.cancel")}</Btn>
        <Btn variant="danger" onClick={onConfirm}>{t("common.delete")}</Btn>
      </div>
    </Modal>
  );
}

export function StatCard({ label, value, icon: Icon, accent = C.green, sub }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: C.slate }}>{label}</span>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1a` }}>
            <Icon size={16} color={accent} />
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ color: C.ink }}>{value}</div>
      {sub && <div className="mt-1 text-xs" style={{ color: C.slateLight }}>{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: C.border }}>
      <Logo variant="mark" size={32} color={C.border} className="mb-3" />
      <p className="text-sm font-semibold" style={{ color: C.ink }}>{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-xs" style={{ color: C.slateLight }}>{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingScreen({ label }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen w-full items-center justify-center" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: C.slate }}>
        <Loader2 size={18} className="animate-spin" />
        {label ?? t("common.loading")}
      </div>
    </div>
  );
}
