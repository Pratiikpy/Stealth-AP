export type PaymentStatus =
  | "pending"
  | "processing"
  | "confirming"
  | "completed"
  | "failed";

export type PaymentMethod = "ALEO" | "USDCx" | "USAD";

export interface Payment {
  id: string;
  company_id: string;
  invoice_id: string;
  vendor_id: string;
  amount_micro: number;
  currency: PaymentMethod;
  status: PaymentStatus;
  transaction_hash: string | null;
  block_height: number | null;
  confirmed_at: string | null;
  gas_fee_micro: number | null;
  settlement_anchor: string | null;
  batch_id: string | null;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BatchPayment {
  id: string;
  company_id: string;
  invoice_ids: string[];
  total_micro: number;
  currency: PaymentMethod;
  status: PaymentStatus;
  transaction_hash: string | null;
  payment_count: number;
  gas_saved_micro: number | null;
  created_by: string;
  created_at: string;
}
