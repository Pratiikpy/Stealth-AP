import { createClient } from "@/lib/supabase/client";
import type { PaymentStatusDb as PaymentStatus } from "@/types";

export interface PaymentRow {
  id: string;
  company_id: string;
  invoice_id: string | null;
  vendor_id: string | null;
  amount_micro: number;
  token: string;
  status: PaymentStatus;
  batch_id: string | null;
  aleo_tx_id: string | null;
  aleo_payment_id: string | null;
  settlement_anchor: string | null;
  block_height: number | null;
  gas_fee_micro: number | null;
  settlement_time_s: number | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  invoices?: { invoice_number: string };
  vendors?: { name: string };
}

export async function listPayments(options: {
  status?: PaymentStatus;
  limit?: number;
} = {}) {
  const supabase = createClient();
  const { status, limit = 50 } = options;

  let query = supabase
    .from("payments")
    .select("*, invoices(invoice_number), vendors(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as PaymentRow[];
}

export async function createPayment(payment: {
  invoice_id: string;
  vendor_id: string;
  amount_micro: number;
  token: string;
  batch_id?: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({ ...payment, status: "pending" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  extra?: {
    aleo_tx_id?: string;
    aleo_payment_id?: string;
    settlement_anchor?: string;
    block_height?: number;
    gas_fee_micro?: number;
    settlement_time_s?: number;
    confirmed_at?: string;
    error_message?: string;
  }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status, ...extra })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPaymentStats() {
  const supabase = createClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from("payments")
    .select("amount_micro, settlement_time_s, token, gas_fee_micro")
    .eq("status", "completed")
    .gte("confirmed_at", startOfMonth);

  if (error) throw error;

  const payments = data ?? [];
  const totalPaid = payments.reduce((s, p) => s + p.amount_micro, 0);
  const avgSettlement = payments.length > 0
    ? Math.round(payments.reduce((s, p) => s + (p.settlement_time_s ?? 0), 0) / payments.length)
    : 0;
  const totalGasSaved = payments.reduce((s, p) => s + ((p.amount_micro * 5) / 100 - (p.gas_fee_micro ?? 0)), 0);

  return {
    totalPaid,
    transactionCount: payments.length,
    avgSettlementSeconds: avgSettlement,
    gasSavedMicro: totalGasSaved,
  };
}
