import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// customer_memberships_overview is a view (expired/completed/expiring-soon/
// unused flags computed server-side, same approach as customer_overview),
// so realtime is wired to the underlying customer_memberships table since
// you can't subscribe to a view directly.
export function useMembershipsOverview(businessId) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!businessId) { setRows([]); setReady(true); return; }
    const { data, error } = await supabase
      .from("customer_memberships_overview")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) { setError(error.message); setReady(true); return; }
    setError(null);
    setRows(data || []);
    setReady(true);
  }, [businessId]);

  useEffect(() => {
    fetchAll();
    if (!businessId) return;
    const channel = supabase
      .channel(`memberships-overview-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_memberships", filter: `business_id=eq.${businessId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll, businessId]);

  return { rows, ready, error, refetch: fetchAll };
}
