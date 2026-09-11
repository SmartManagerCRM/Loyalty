import React from "react";
import { useTranslation } from "react-i18next";
import { C } from "../../components/theme";
import { EmptyState } from "../../components/ui";
import { DAY_START_HOUR, DAY_END_HOUR, sameDay, startOfWeek, addDays, statusColorKey } from "../../lib/bookingUtils";

const STATUS_COLOR = {
  amber: { color: C.amber, bg: "#C77D141a" },
  teal: { color: C.teal, bg: "#0E4F5C1a" },
  green: { color: C.green, bg: C.greenTint },
  slateLight: { color: C.slateLight, bg: C.bg },
  red: { color: C.red, bg: "#C63B3B1a" },
  slate: { color: C.slate, bg: C.bg },
};

function timeLabel(h) {
  const d = new Date(); d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

function BookingBlock({ b, onClick, startHour, endHour }) {
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);
  const dayStart = new Date(start); dayStart.setHours(startHour, 0, 0, 0);
  const totalMin = (endHour - startHour) * 60;
  const top = Math.max(0, ((start - dayStart) / 60000 / totalMin) * 100);
  const height = Math.max(3, ((end - start) / 60000 / totalMin) * 100);
  const palette = STATUS_COLOR[statusColorKey(b.status)];

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-start shadow-sm transition-opacity hover:opacity-90"
      style={{ top: `${top}%`, height: `${height}%`, backgroundColor: palette.bg, border: `1px solid ${palette.color}55` }}
    >
      <div className="truncate text-xs font-bold" style={{ color: palette.color }}>
        <bdi>{start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</bdi> {b.customers?.name || ""}
      </div>
      <div className="truncate text-[11px]" style={{ color: C.slate }}>{b.services?.name || ""}</div>
    </button>
  );
}

// Staff-column time grid for one day — the default view. Each column is a
// lane (one per active staff member, plus "Unassigned" when relevant);
// bookings are absolutely positioned by their real start/end time within
// business hours, so overlaps and gaps are visually obvious.
export function DayView({ date, bookings, staffList, onSelect, startHour = DAY_START_HOUR, endHour = DAY_END_HOUR }) {
  const { t } = useTranslation();
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const lanes = staffList.filter((s) => s.active);
  const unassigned = bookings.filter((b) => !b.staff_id);
  const showUnassigned = unassigned.length > 0 || lanes.length === 0;
  const columns = [...lanes.map((s) => ({ id: s.id, name: s.name })), ...(showUnassigned ? [{ id: null, name: t("bookings.unassignedColumn") }] : [])];

  if (columns.length === 0) {
    return <EmptyState title={t("bookings.day.noStaffTitle")} subtitle={t("bookings.day.noStaffSubtitle")} />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex min-w-[640px]">
        <div className="w-14 shrink-0 border-e" style={{ borderColor: C.border }}>
          <div className="h-10 border-b" style={{ borderColor: C.border }} />
          <div className="relative" style={{ height: `${(hours.length - 1) * 56}px` }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute w-full text-end pe-2 text-[11px]" style={{ top: `${i * 56 - 6}px`, color: C.slateLight }}>
                <bdi>{timeLabel(h)}</bdi>
              </div>
            ))}
          </div>
        </div>
        {columns.map((col) => {
          const colBookings = bookings.filter((b) => (col.id === null ? !b.staff_id : b.staff_id === col.id));
          return (
            <div key={col.id ?? "unassigned"} className="min-w-[180px] flex-1 border-e" style={{ borderColor: C.border }}>
              <div className="flex h-10 items-center justify-center border-b px-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.ink }}>
                {col.name}
              </div>
              <div className="relative" style={{ height: `${(hours.length - 1) * 56}px` }}>
                {hours.slice(0, -1).map((h, i) => (
                  <div key={h} className="absolute w-full border-b" style={{ top: `${(i + 1) * 56}px`, borderColor: C.border }} />
                ))}
                {colBookings.map((b) => <BookingBlock key={b.id} b={b} onClick={() => onSelect(b)} startHour={startHour} endHour={endHour} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Lightweight week view: one row per day with a compact list of that day's
// bookings — deliberately simpler than the day grid (per spec).
export function WeekView({ date, bookings, onSelect, onPickDay }) {
  const { t } = useTranslation();
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
      {days.map((d) => {
        const dayBookings = bookings
          .filter((b) => sameDay(new Date(b.start_at), d))
          .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
        return (
          <div key={d.toISOString()} className="rounded-2xl bg-white p-3 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => onPickDay(d)} className="mb-2 text-xs font-bold hover:underline" style={{ color: C.ink }}>
              <bdi>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</bdi>
            </button>
            <div className="flex flex-col gap-1.5">
              {dayBookings.length === 0 ? (
                <p className="text-[11px]" style={{ color: C.slateLight }}>{t("bookings.week.empty")}</p>
              ) : dayBookings.map((b) => {
                const palette = STATUS_COLOR[statusColorKey(b.status)];
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelect(b)}
                    className="rounded-lg px-2 py-1 text-start text-[11px]"
                    style={{ backgroundColor: palette.bg, color: palette.color }}
                  >
                    <bdi>{new Date(b.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</bdi> {b.customers?.name || ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Month summary: a count per day; clicking a day jumps to the Day view.
export function MonthView({ date, bookings, onPickDay }) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const countsByDay = {};
  for (const b of bookings) {
    const d = new Date(b.start_at);
    if (d.getMonth() !== date.getMonth()) continue;
    const key = d.getDate();
    countsByDay[key] = (countsByDay[key] || 0) + 1;
  }

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === date.getMonth();
          const count = inMonth ? countsByDay[d.getDate()] || 0 : 0;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className="flex h-20 flex-col items-start rounded-lg p-2 text-start transition-colors hover:bg-black/[0.03]"
              style={{
                opacity: inMonth ? 1 : 0.35,
                border: sameDay(d, today) ? `1.5px solid ${C.green}` : `1px solid ${C.border}`,
              }}
            >
              <span className="text-xs font-semibold" style={{ color: C.ink }}>{d.getDate()}</span>
              {count > 0 && (
                <span className="mt-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: C.greenTint, color: C.greenDeep }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
