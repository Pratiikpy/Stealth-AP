export type VendorStatus = "active" | "inactive";

export interface Vendor {
  id: string;
  company_id: string;
  name: string;
  legal_name: string | null;
  tax_id_encrypted: string | null;
  payment_address: string | null;
  default_token: "ALEO" | "USDCx" | "USAD";
  payment_terms: number;
  category: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: VendorStatus;
  total_paid_micro: number;
  invoice_count: number;
  vendor_hash: string | null;
  created_at: string;
  updated_at: string;
}
