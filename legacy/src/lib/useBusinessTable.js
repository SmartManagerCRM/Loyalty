import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Generic tenant-scoped CRUD + realtime hook, mirroring the pattern from
// the Sales CRM's useSupabaseTable — but every query is pinned to the
// current business, since this product is multi-tenant.
export function useBusinessTable(table, businessId, { select = "*", orderBy = "created_at", ascending = false } = {}) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!businessId) { setRows([]); setReady(true); return; }
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("business_id", businessId)
      .order(orderBy, { ascending });
    if (error) { setError(error.message); setReady(true); return; }
    setError(null);
    setRows(data || []);
    setReady(true);
  }, [table, businessId, select, orderBy, ascending]);

  useEffect(() => {
    fetchAll();
    if (!businessId) return;
    const channel = supabase
      .channel(`realtime-${table}-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `business_id=eq.${businessId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll, businessId, table]);

  const insertRow = useCallback(async (rec) => {
    const { error } = await supabase.from(table).insert({ ...rec, business_id: businessId });
    if (error) setError(error.message); else fetchAll();
  }, [table, businessId, fetchAll]);

  const updateRow = useCallback(async (id, rec) => {
    const { error } = await supabase.from(table).update(rec).eq("id", id).eq("business_id", businessId);
    if (error) setError(error.message); else fetchAll();
  }, [table, businessId, fetchAll]);

  const deleteRow = useCallback(async (id) => {
    const { error } = await supabase.from(table).delete().eq("id", id).eq("business_id", businessId);
    if (error) setError(error.message); else fetchAll();
  }, [table, businessId, fetchAll]);

  return { rows, ready, error, refetch: fetchAll, insertRow, updateRow, deleteRow };
}
