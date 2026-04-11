import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatusDb as InvoiceStatus } from "@/types";

export interface InvoiceRow {
  id: string;
  company_id: string;
  invoice_number: string;
  vendor_id: string;
  amount_micro: number;
  tax_amount_micro: number;
  total_amount_micro: number;
  currency: string;
  token: string;
  issue_date: string;
  due_date: string;
  line_items: unknown[];
  gl_code: string | null;
  po_number: string | null;
  notes: string | null;
  pdf_path: string | null;
  pdf_hash: string | null;
  status: InvoiceStatus;
  invoice_hash: string | null;
  aleo_invoice_id: string | null;
  aleo_tx_id: string | null;
  confidence_score: number | null;
  extracted_data: unknown;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  vendors?: { name: string; payment_address: string | null };
}

interface ListOptions {
  status?: InvoiceStatus | "all";
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
}

export async function listInvoices(options: ListOptions = {}) {
  const supabase = createClient();
  const {
    status = "all",
    search,
    limit = 50,
    offset = 0,
    orderBy = "created_at",
    ascending = false,
  } = options;

  let query = supabase
    .from("invoices")
    .select("*, vendors(name, payment_address)", { count: "exact" })
    .order(orderBy, { ascending })
    .range(offset, offset + limit - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(
      `invoice_number.ilike.%${search}%,vendors.name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { data: data as InvoiceRow[], count: count ?? 0 };
}

export async function getInvoice(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, vendors(name, payment_address, category, contact_email)")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as InvoiceRow;
}

export async function createInvoice(invoice: {
  invoice_number: string;
  vendor_id: string;
  amount_micro: number;
  tax_amount_micro: number;
  total_amount_micro: number;
  currency: string;
  token: string;
  issue_date: string;
  due_date: string;
  line_items?: unknown[];
  gl_code?: string;
  po_number?: string;
  notes?: string;
  pdf_path?: string;
  pdf_hash?: string;
  confidence_score?: number;
  extracted_data?: unknown;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      ...invoice,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  extra?: {
    approved_by?: string;
    approved_at?: string;
    paid_at?: string;
    invoice_hash?: string;
    aleo_invoice_id?: string;
    aleo_tx_id?: string;
  }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status, ...extra })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getInvoiceStats() {
  const supabase = createClient();

  const [pending, thisMonth, paid] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "approved"]),
    supabase
      .from("invoices")
      .select("total_amount_micro")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase
      .from("invoices")
      .select("total_amount_micro, paid_at")
      .eq("status", "paid")
      .not("paid_at", "is", null),
  ]);

  const thisMonthTotal = (thisMonth.data ?? []).reduce(
    (sum, inv) => sum + (inv.total_amount_micro ?? 0),
    0
  );

  return {
    pendingCount: pending.count ?? 0,
    thisMonthTotal,
    paidCount: (paid.data ?? []).length,
  };
}

export async function checkDuplicate(pdfHash: string) {
  const supabase = createClient();
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("pdf_hash", pdfHash);

  return (count ?? 0) > 0;
}
