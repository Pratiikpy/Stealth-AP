export type InvoiceStatus =
  | "draft"
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled";

export type CurrencyFlag = "ALEO" | "USDCx" | "USAD";

export interface Invoice {
  id: string;
  company_id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name: string;
  amount_micro: number;
  tax_micro: number;
  total_micro: number;
  currency: CurrencyFlag;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  pdf_url: string | null;
  po_number: string | null;
  notes: string | null;
  status: InvoiceStatus;
  gl_code: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  aleo_record_id: string | null;
  invoice_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price_micro: number;
  total_micro: number;
  gl_code?: string;
}

export interface InvoiceExtraction {
  vendor_name: string | null;
  invoice_number: string | null;
  amount: number | null;
  tax_amount: number | null;
  due_date: string | null;
  issue_date: string | null;
  line_items: LineItem[];
  po_number: string | null;
  currency: string | null;
  confidence: Record<string, number>;
}
