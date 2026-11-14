"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";

// Restores an existing session on page load and clears the app when the session ends.
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      if (data.session && !useAppStore.getState().currentUser) useAppStore.getState().init();
    });
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") useAppStore.getState().reset();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
