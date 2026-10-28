import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Select, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { useMembershipsOverview } from "../../lib/useMembershipsOverview";
import { sameDay, addDays, startOfWeek } from "../../lib/bookingUtils";
import { DayView, WeekView, MonthView } from "./CalendarViews";
import EmptySlotPanel from "./EmptySlotPanel";
import BookingModal from "./BookingModal";

const VIEWS = ["day", "week", "month"];
const BOOKINGS_SELECT = "*, customers(id,name,phone), services(id,name,duration_minutes,price), staff(id,name)";

export default function Bookings() {
  const { t } = useTranslation();
  const { business } = useAuth();
  const visitLabel = business?.visit_label || "Visit";

  const { rows: bookings, ready: bookingsReady, refetch } = useBusinessTable("bookings", business?.id, { select: BOOKINGS_SELECT, orderBy: "start_at", ascending: true });
  const { rows: staffList, ready: staffReady } = useBusinessTable("staff", business?.id, { orderBy: "name", ascending: true });
  const { rows: services, ready: servicesReady } = useBusinessTable("services", business?.id, { orderBy: "name", ascending: true });
  const { rows: customers, ready: customersReady } = useBusinessTable("customers", business?.id, { orderBy: "name", ascending: true });
  const { rows: customerOverview, ready: overviewReady } = useCustomerOverview(business?.id);
  const { rows: memberships, ready: membershipsReady } = useMembershipsOverview(business?.id);

  const [view, setView] = useState("day");
  const [date, setDate] = useState(new Date());
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null); // { booking?, defaultStart? } | null

  const ready = bookingsReady && staffReady && servicesReady && customersReady && overviewReady && membershipsReady;

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (staffFilter && b.staff_id !== staffFilter) return false;
      if (serviceFilter && b.service_id !== serviceFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      return true;
    });
  }, [bookings, staffFilter, serviceFilter, statusFilter]);

  const dayBookings = useMemo(
    () => filtered.filter((b) => sameDay(new Date(b.start_at), date)),
    [filtered, date]
  );

  const weekBookings = useMemo(() => {
    const start = startOfWeek(date);
    const end = addDays(start, 7);
    return filtered.filter((b) => { const d = new Date(b.start_at); return d >= start && d < end; });
  }, [filtered, date]);

  const monthBookings = useMemo(() => {
    return filtered.filter((b) => { const d = new Date(b.start_at); return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear(); });
  }, [filtered, date]);

  const minGapMinutes = useMemo(() => {
    const active = services.filter((s) => s.active);
    if (active.length === 0) return 30;
    return Math.min(...active.map((s) => s.duration_minutes || 30));
  }, [services]);

  function step(dir) {
    if (view === "day") setDate((d) => addDays(d, dir));
    else if (view === "week") setDate((d) => addDays(d, dir * 7));
    else setDate((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }

  function headerLabel() {
    if (view === "day") return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const start = startOfWeek(date);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>{t("common.loading")}</div>;

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-lg p-1.5 hover:bg-black/5" style={{ color: C.slate }}><ChevronLeft size={18} className="rtl:rotate-180" /></button>
          <button onClick={() => setDate(new Date())} className="rounded-lg px-2.5 py-1 text-xs font-semibold hover:bg-black/5" style={{ color: C.slate, border: `1px solid ${C.border}` }}>
            {t("bookings.today")}
          </button>
          <button onClick={() => step(1)} className="rounded-lg p-1.5 hover:bg-black/5" style={{ color: C.slate }}><ChevronRight size={18} className="rtl:rotate-180" /></button>
          <h1 className="ms-2 text-sm font-bold" style={{ color: C.ink }}><bdi>{headerLabel()}</bdi></h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: C.bg }}>
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ backgroundColor: view === v ? C.white : "transparent", color: view === v ? C.ink : C.slateLight, boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
              >
                {t(`bookings.views.${v}`)}
              </button>
            ))}
          </div>
          <Btn icon={Plus} onClick={() => setModal({ defaultStart: new Date(date) })}>{t("bookings.newBooking")}</Btn>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Select
          className="w-44"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          options={[{ value: "", label: t("bookings.filters.allStaff") }, ...staffList.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Select
          className="w-44"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          options={[{ value: "", label: t("bookings.filters.allServices") }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Select
          className="w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: "", label: t("bookings.filters.allStatuses") }, ...["pending", "confirmed", "completed", "cancelled", "no_show"].map((k) => ({ value: k, label: t(`bookings.status.${k}`) }))]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div>
          {bookings.length === 0 && view !== "month" ? (
            <EmptyState
              title={t("bookings.emptyTitle")}
              subtitle={t("bookings.emptySubtitle")}
              action={<Btn icon={Plus} onClick={() => setModal({ defaultStart: new Date(date) })}>{t("bookings.newBooking")}</Btn>}
            />
          ) : view === "day" ? (
            <DayView
              date={date} bookings={dayBookings} staffList={staffList} onSelect={(b) => setModal({ booking: b })}
              startHour={business?.business_hours_start} endHour={business?.business_hours_end}
            />
          ) : view === "week" ? (
            <WeekView date={date} bookings={weekBookings} onSelect={(b) => setModal({ booking: b })} onPickDay={(d) => { setDate(d); setView("day"); }} />
          ) : (
            <MonthView date={date} bookings={monthBookings} onPickDay={(d) => { setDate(d); setView("day"); }} />
          )}
        </div>

        {view === "day" && (
          <EmptySlotPanel
            date={date}
            dayBookings={dayBookings}
            staffList={staffList}
            staffFilter={staffFilter}
            minMinutes={minGapMinutes}
            customerRows={customerOverview}
            business={business}
            visitLabel={visitLabel}
          />
        )}
      </div>

      {modal && (
        <BookingModal
          business={business}
          booking={modal.booking}
          defaultStart={modal.defaultStart}
          customers={customers}
          memberships={memberships}
          services={services}
          staffList={staffList}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
