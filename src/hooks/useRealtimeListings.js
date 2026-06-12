import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { qk } from "../lib/queryClient";
import { useUiStore } from "./useUiStore";

export function useRealtimeListings() {
  const qc = useQueryClient();
  const inc = useUiStore(s => s.incNewRates);

  useEffect(() => {
    const channel = supabase
      .channel("listings-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "listings" }, () => {
        inc();
        // soft invalidate; the user explicitly clicks "refresh" to refetch.
        qc.invalidateQueries({ queryKey: qk.listings, refetchType: "none" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, inc]);
}
