// Shared time-grid math for the Bookings calendar views. Business hours
// come from businesses.business_hours_start/end (Settings -> Business);
// these are just the fallback for when a business row isn't loaded yet.
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;

export function dayWindow(date, startHour = DAY_START_HOUR, endHour = DAY_END_HOUR) {
  const start = new Date(date);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(endHour, 0, 0, 0);
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
export function findGaps(bookings, day, minMinutes, startHour = DAY_START_HOUR, endHour = DAY_END_HOUR) {
  const { start, end } = dayWindow(day, startHour, endHour);
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
