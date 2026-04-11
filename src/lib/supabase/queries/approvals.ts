import { createClient } from "@/lib/supabase/client";
import type { ApprovalStatusDb as ApprovalStatus } from "@/types";

export interface ApprovalRow {
  id: string;
  invoice_id: string;
  approver_id: string;
  status: ApprovalStatus;
  reason_hash: string | null;
  reason_text: string | null;
  comments: string | null;
  email_token: string | null;
  delegated_from: string | null;
  decided_at: string | null;
  created_at: string;
  invoices?: {
    invoice_number: string;
    vendor_id: string;
    total_amount_micro: number;
    due_date: string;
    gl_code: string | null;
    created_by: string | null;
    vendors?: { name: string; category: string | null };
  };
  users?: { first_name: string | null; last_name: string | null; email: string };
}

export async function listPendingApprovals(approverId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "*, invoices(invoice_number, vendor_id, total_amount_micro, due_date, gl_code, created_by, vendors(name, category))"
    )
    .eq("approver_id", approverId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as ApprovalRow[];
}

export async function listRecentDecisions(approverId: string, limit = 10) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "*, invoices(invoice_number, total_amount_micro, vendors(name))"
    )
    .eq("approver_id", approverId)
    .in("status", ["approved", "rejected"])
    .order("decided_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as ApprovalRow[];
}

export async function approveInvoice(approvalId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .select("*, invoices(id)")
    .single();

  if (error) throw error;

  // Also update invoice status
  if (data?.invoices?.id) {
    await supabase
      .from("invoices")
      .update({
        status: "approved",
        approved_by: data.approver_id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.invoices.id);
  }

  return data;
}

export async function rejectInvoice(
  approvalId: string,
  reasonText: string,
  reasonHash?: string
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({
      status: "rejected",
      reason_text: reasonText,
      reason_hash: reasonHash,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .select("*, invoices(id)")
    .single();

  if (error) throw error;

  if (data?.invoices?.id) {
    await supabase
      .from("invoices")
      .update({ status: "rejected" })
      .eq("id", data.invoices.id);
  }

  return data;
}

export async function approveByEmailToken(token: string) {
  const supabase = createClient();

  const { data: approval, error: findError } = await supabase
    .from("approvals")
    .select("*, invoices(id)")
    .eq("email_token", token)
    .eq("status", "pending")
    .gt("email_token_exp", new Date().toISOString())
    .single();

  if (findError || !approval) {
    throw new Error("Invalid or expired approval token");
  }

  return approveInvoice(approval.id);
}
