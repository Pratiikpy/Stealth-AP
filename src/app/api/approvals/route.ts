import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("approvals")
      .select(
        "*, invoices(invoice_number, vendor_id, total_amount_micro, due_date, gl_code, vendors(name, category))"
      )
      .order("created_at", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, reason_text } = body;
    const approvalId = body.id || body.approval_id;

    if (!approvalId) {
      return NextResponse.json({ error: "Approval ID is required" }, { status: 400 });
    }

    // Verify the user is the assigned approver
    const { data: approval, error: approvalError } = await supabase
      .from("approvals")
      .select("approver_id")
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    if (approval.approver_id !== user.id) {
      return NextResponse.json({ error: "You are not the assigned approver" }, { status: 403 });
    }

    if (action === "approve") {
      const { data, error } = await supabase
        .from("approvals")
        .update({
          status: "approved",
          decided_at: new Date().toISOString(),
        })
        .eq("id", approvalId)
        .select("*, invoices(id, invoice_number)")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Update invoice status
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

      return NextResponse.json({ data });
    }

    if (action === "reject") {
      const { data, error } = await supabase
        .from("approvals")
        .update({
          status: "rejected",
          reason_text: reason_text,
          decided_at: new Date().toISOString(),
        })
        .eq("id", approvalId)
        .select("*, invoices(id)")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data?.invoices?.id) {
        await supabase
          .from("invoices")
          .update({ status: "rejected" })
          .eq("id", data.invoices.id);
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
}
