import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Shared by Dashboard and Analytics — both need the business's full
// revenue_events history to compute their own (different) rollups from.
export function useRevenueEvents(businessId) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!businessId) return;
    supabase.from("revenue_events").select("*").eq("business_id", businessId).then(({ data }) => {
      setRows(data || []);
      setReady(true);
    });
  }, [businessId]);
  return { rows, ready };
}
