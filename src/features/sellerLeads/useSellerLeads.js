import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

// Data layer for "Ready to Sell" seller leads. Rows are written by farmers
// (insert, and a soft-delete update restricted to is_deleted by the column
// grant) and read by farmers (their own) and merchants (every active row).
// farmer_name/farmer_phone are stamped server side by the seller_leads
// trigger, never sent by the client.

export const MAX_ACTIVE_SELLER_LEADS = 5;

// A farmer's own active leads, newest first.
export function useMySellerLeads(farmerId) {
  return useQuery({
    queryKey: qk.sellerLeadsMine(farmerId),
    enabled: !!farmerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_leads")
        .select("*")
        .eq("farmer_id", farmerId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateSellerLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ farmerId, description }) => {
      const { data, error } = await supabase
        .from("seller_leads")
        .insert({ farmer_id: farmerId, description })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: qk.sellerLeadsMine(saved.farmer_id) });
    },
  });
}

// Soft delete: sets is_deleted=true. The column grant allows nothing else.
export function useDeleteSellerLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, farmerId }) => {
      const { error } = await supabase
        .from("seller_leads")
        .update({ is_deleted: true })
        .eq("id", id);
      if (error) throw error;
      return { farmerId };
    },
    onSuccess: ({ farmerId }) => {
      qc.invalidateQueries({ queryKey: qk.sellerLeadsMine(farmerId) });
    },
  });
}

// Merchant: every active lead, newest first.
export function useActiveSellerLeads() {
  return useQuery({
    queryKey: qk.sellerLeadsActive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_leads")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Merchant's own read receipts: which seller_lead_id values they have opened.
export function useMySellerLeadReads(merchantId) {
  return useQuery({
    queryKey: qk.sellerLeadReads(merchantId),
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_lead_reads")
        .select("seller_lead_id")
        .eq("merchant_id", merchantId);
      if (error) throw error;
      return data || [];
    },
  });
}

// Marks one lead read for the signed-in merchant. Upserts so a second view
// of the same lead is a no-op rather than a unique-constraint error.
export function useMarkSellerLeadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ merchantId, sellerLeadId }) => {
      const { error } = await supabase
        .from("seller_lead_reads")
        .upsert(
          { merchant_id: merchantId, seller_lead_id: sellerLeadId },
          { onConflict: "merchant_id,seller_lead_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: qk.sellerLeadReads(variables.merchantId) });
    },
  });
}

// Unread count for the Seller Leads tab badge: active leads with no read
// receipt yet from this merchant.
export function useSellerLeadsUnreadCount(merchantId) {
  const leadsQ = useActiveSellerLeads();
  const readsQ = useMySellerLeadReads(merchantId);
  const leads = leadsQ.data || [];
  const readIds = new Set((readsQ.data || []).map((r) => r.seller_lead_id));
  return leads.filter((l) => !readIds.has(l.id)).length;
}
