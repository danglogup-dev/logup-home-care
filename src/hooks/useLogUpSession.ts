import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
export function useLogUpSession() {
  const [state, setState] = useState<{ loading: boolean; session: Session | null }>({ loading: true, session: null });
  useEffect(() => {
    let active = true; let receivedEvent = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      if (active) setState({ loading: false, session });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && !receivedEvent) setState({ loading: false, session: data.session });
    }).catch(() => { if (active && !receivedEvent) setState({ loading: false, session: null }); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return state;
}