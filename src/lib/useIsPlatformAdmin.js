import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Whether the signed-in user is a platform admin — a dimension entirely
// separate from business membership/role (see supabase/schema.sql
// "Platform Admin"). Re-checked whenever the session's user id changes so
// switching accounts doesn't leak the previous user's admin state.
export function useIsPlatformAdmin(userId) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId) { setIsAdmin(false); setChecked(true); return; }
    setChecked(false);
    supabase.rpc("is_platform_admin").then(({ data, error }) => {
      setIsAdmin(!error && Boolean(data));
      setChecked(true);
    });
  }, [userId]);

  return { isAdmin, checked };
}
