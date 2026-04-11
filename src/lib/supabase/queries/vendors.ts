import { createClient } from "@/lib/supabase/client";

export interface VendorRow {
  id: string;
  company_id: string;
  name: string;
  legal_name: string | null;
  vendor_hash: string | null;
  payment_address: string | null;
  default_token: string;
  payment_terms: number;
  category: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: string;
  total_paid_micro: number;
  invoice_count: number;
  portal_enabled: boolean;
  created_at: string;
}

export async function listVendors(search?: string) {
  const supabase = createClient();

  let query = supabase
    .from("vendors")
    .select("*")
    .eq("status", "active")
    .order("name");

  if (search) {
    query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as VendorRow[];
}

export async function getVendor(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as VendorRow;
}

export async function createVendor(vendor: {
  name: string;
  legal_name?: string;
  payment_address?: string;
  default_token?: string;
  payment_terms?: number;
  category?: string;
  contact_name?: string;
  contact_email?: string;
  notes?: string;
  vendor_hash?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({ ...vendor, status: "active" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVendor(
  id: string,
  updates: Partial<VendorRow>
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vendors")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
