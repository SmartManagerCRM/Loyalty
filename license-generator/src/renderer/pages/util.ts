export function fmtDate(iso: string | null, time = false): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return time ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}
export const todayYmd = () => fmtDate(new Date().toISOString());
export const stateLabel: Record<string, { text: string; cls: string }> = {
  active: { text: "Active", cls: "ok" }, expiring: { text: "Expiring soon", cls: "warn" }, expired: { text: "Expired", cls: "bad" },
  superseded: { text: "Replaced", cls: "" }, not_started: { text: "Not started", cls: "info" },
};
