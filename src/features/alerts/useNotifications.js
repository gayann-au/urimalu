import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// Data layer for in-app notifications. Rows are written only by the database
// trigger on price_history; the client reads its own rows and can mark them
// read (the column grant allows updating read_at and nothing else).

// Newest 50 notifications for the signed-in user. The realtime subscription
// below (useRealtimeNotifications) is what makes the bell and list update
// within a second or two of a new row; the minute poll here is only a
// fallback for when the realtime channel is briefly disconnected. The unread
// count is derived from this same cache, so the header and the list page
// share one request and one invalidation.
export function useMyNotifications() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: qk.notifications(profile?.id),
    enabled: !!profile?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
}

// Unread count for the header bell, derived from the shared list cache.
export function useUnreadNotificationCount() {
  const notificationsQ = useMyNotifications();
  return (notificationsQ.data || []).filter((n) => !n.read_at).length;
}

// Mark every unread notification as read. Called by the list page once the
// list is on screen, so opening the page clears the bell badge.
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!profile) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", profile.id)
        .is("read_at", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (profile) qc.invalidateQueries({ queryKey: qk.notifications(profile.id) });
    },
  });
}

// Realtime subscription for the signed-in user's own notifications, same
// pattern as useRealtimeListings.js: open a channel, filter server side to
// this user's rows only, and on INSERT invalidate the matching query so every
// mounted consumer (header bell, notification list) refetches automatically.
// Mounted once for the whole app in routes.jsx, so it stays alive across
// navigation and only tears down on logout or app close.
export function useRealtimeNotifications() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userId = profile?.id;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: qk.notifications(userId) });
          // A seller lead notification means a new row exists in seller_leads
          // and this merchant has no read receipt for it yet: refresh both so
          // the dashboard's Seller Leads tab and its badge update live.
          if (payload?.new?.type === "seller_lead") {
            qc.invalidateQueries({ queryKey: qk.sellerLeadsActive });
            qc.invalidateQueries({ queryKey: qk.sellerLeadReads(userId) });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);
}
