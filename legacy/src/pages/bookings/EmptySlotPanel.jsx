import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, MessageCircle } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill, EmptyState } from "../../components/ui";
import { findGaps } from "../../lib/bookingUtils";
import { nextBestAction } from "../../lib/segmentation";
import { generateMessage } from "../../lib/messageTemplates";
import { openWhatsApp } from "../../lib/whatsapp";
import { formatMoney } from "../../lib/currencies";

function formatRange(start, end) {
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

// Surfaces real gaps in today's schedule (a database-backed calculation,
// not a guess) next to the customers most worth filling them with — reusing
// the same segmentation flags and message generator as Retention/Reactivation,
// so this stays a manual "review → Open WhatsApp → send" action, never an
// automated message (see README "WhatsApp").
export default function EmptySlotPanel({ date, dayBookings, staffList, staffFilter, minMinutes, customerRows, business, visitLabel }) {
  const { t } = useTranslation();

  const startHour = business?.business_hours_start;
  const endHour = business?.business_hours_end;

  const gaps = useMemo(() => {
    if (staffFilter) {
      return findGaps(dayBookings.filter((b) => b.staff_id === staffFilter), date, minMinutes, startHour, endHour)
        .map((g) => ({ ...g, staffName: staffList.find((s) => s.id === staffFilter)?.name }));
    }
    const activeStaff = staffList.filter((s) => s.active);
    if (activeStaff.length === 0) {
      return findGaps(dayBookings, date, minMinutes, startHour, endHour).map((g) => ({ ...g, staffName: null }));
    }
    return activeStaff
      .flatMap((s) => findGaps(dayBookings.filter((b) => b.staff_id === s.id), date, minMinutes, startHour, endHour).map((g) => ({ ...g, staffName: s.name })))
      .sort((a, b) => a.start - b.start);
  }, [dayBookings, date, minMinutes, staffFilter, staffList, startHour, endHour]);

  const totalOpenMinutes = gaps.reduce((sum, g) => sum + g.minutes, 0);

  const candidates = useMemo(() => {
    return customerRows
      .filter((r) => r.is_due || r.is_inactive || r.is_lost)
      .sort((a, b) => Number(b.total_spending || 0) - Number(a.total_spending || 0))
      .slice(0, 5);
  }, [customerRows]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2">
        <CalendarClock size={16} color={C.teal} />
        <h2 className="text-sm font-bold" style={{ color: C.ink }}>{t("bookings.emptySlots.title")}</h2>
      </div>

      {gaps.length === 0 ? (
        <p className="mt-3 text-xs" style={{ color: C.slateLight }}>{t("bookings.emptySlots.noGaps")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>
            {t("bookings.emptySlots.summary", { count: gaps.length, hours: (totalOpenMinutes / 60).toFixed(1) })}
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {gaps.slice(0, 6).map((g, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: C.bg }}>
                <span style={{ color: C.ink }}><bdi>{formatRange(g.start, g.end)}</bdi>{g.staffName ? ` · ${g.staffName}` : ""}</span>
                <span style={{ color: C.slateLight }}>{t("bookings.emptySlots.minutesShort", { count: Math.round(g.minutes) })}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 border-t pt-4" style={{ borderColor: C.border }}>
        <p className="text-xs font-semibold" style={{ color: C.slate }}>{t("bookings.emptySlots.candidatesTitle")}</p>
        {candidates.length === 0 ? (
          <div className="mt-2"><EmptyState title={t("bookings.emptySlots.noCandidates")} /></div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {candidates.map((r) => {
              const nba = nextBestAction(r, { visitLabel });
              return (
                <div key={r.customer_id} className="rounded-lg p-2.5" style={{ border: `1px solid ${C.border}` }}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold" style={{ color: C.ink }}>{r.name}</span>
                    {r.is_lost && <Pill color={C.red} bg="#C63B3B1a">{t("segments.lost")}</Pill>}
                    {!r.is_lost && r.is_inactive && <Pill color={C.amber} bg="#C77D141a">{t("segments.inactive")}</Pill>}
                    {!r.is_lost && !r.is_inactive && r.is_due && <Pill color={C.teal} bg="#0E4F5C1a">{t("segments.due")}</Pill>}
                  </div>
                  <div className="text-xs" style={{ color: C.slateLight }}>{formatMoney(r.total_spending, business?.currency)}</div>
                  <Btn
                    icon={MessageCircle}
                    disabled={!r.phone}
                    className="mt-2 w-full justify-center"
                    onClick={() => openWhatsApp(r.phone, generateMessage({
                      action: nba.action, customerName: r.name, businessName: business?.name, days: r.days_since_last_visit, language: business?.default_language,
                    }))}
                  >
                    {t("common.openWhatsApp")}
                  </Btn>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
