import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// Data layer for in-app notifications. Rows are written only by the database
// trigger on price_history; the client reads its own rows and can mark them
// read (the column grant allows updating read_at and nothing else).

// Newest 50 notifications for the signed-in user. Polled once a minute so the
// bell badge stays roughly current while the app is open without hammering
// the API. The unread count is derived from this same cache, so the header
// and the list page share one request.
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
