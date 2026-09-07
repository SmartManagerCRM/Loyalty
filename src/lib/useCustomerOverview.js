import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// customer_overview is a view (name/phone/email/notes + every segmentation
// stat and flag), so most screens need just this one query. Realtime is
// wired to the underlying tables since you can't subscribe to a view.
export function useCustomerOverview(businessId) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!businessId) { setRows([]); setReady(true); return; }
    const { data, error } = await supabase
      .from("customer_overview")
      .select("*")
      .eq("business_id", businessId)
      .order("last_visit_date", { ascending: true, nullsFirst: true });
    if (error) { setError(error.message); setReady(true); return; }
    setError(null);
    setRows(data || []);
    setReady(true);
  }, [businessId]);

  useEffect(() => {
    fetchAll();
    if (!businessId) return;
    const channel = supabase
      .channel(`customer-overview-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `business_id=eq.${businessId}` }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_visits", filter: `business_id=eq.${businessId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll, businessId]);

  return { rows, ready, error, refetch: fetchAll };
}
