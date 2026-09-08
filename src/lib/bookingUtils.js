// Shared time-grid math for the Bookings calendar views. Business hours are
// a fixed display window for now (not a stored per-business setting) — a
// reasonable default that keeps the day grid readable; making it
// configurable is a clean seam for later, not something asked for here.
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;

export function dayWindow(date) {
  const start = new Date(date);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = new Date(date);
  end.setHours(DAY_END_HOUR, 0, 0, 0);
  return { start, end };
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isActiveBooking(b) {
  return b.status !== "cancelled" && b.status !== "no_show";
}

// Gaps of at least `minMinutes` between `bookings` (already the set for one
// staff member / one lane) within that day's business-hours window.
export function findGaps(bookings, day, minMinutes) {
  const { start, end } = dayWindow(day);
  const busy = bookings
    .filter(isActiveBooking)
    .map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) }))
    .sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = start;
  for (const b of busy) {
    if (b.start > cursor) {
      const minutes = (b.start - cursor) / 60000;
      if (minutes >= minMinutes) gaps.push({ start: new Date(cursor), end: new Date(b.start), minutes });
    }
    if (b.end > cursor) cursor = new Date(b.end);
  }
  if (end > cursor) {
    const minutes = (end - cursor) / 60000;
    if (minutes >= minMinutes) gaps.push({ start: new Date(cursor), end: new Date(end), minutes });
  }
  return gaps;
}

const STATUS_COLOR_KEYS = {
  pending: "amber",
  confirmed: "teal",
  completed: "green",
  cancelled: "slateLight",
  no_show: "red",
};

export function statusColorKey(status) {
  return STATUS_COLOR_KEYS[status] || "slate";
}
