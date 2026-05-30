import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) throw error;
  return data || [];
}

async function fetchRates() {
  const { data, error } = await supabase.from("rates").select("*").eq("active", true).order("posted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchReviews() {
  const { data, error } = await supabase.from("reviews").select("*");
  if (error) throw error;
  return data || [];
}

export function useUsers()   { return useQuery({ queryKey: qk.users,   queryFn: fetchUsers }); }
export function useRates()   { return useQuery({ queryKey: qk.rates,   queryFn: fetchRates }); }
export function useReviews() { return useQuery({ queryKey: qk.reviews, queryFn: fetchReviews }); }