import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status");

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
      console.error("[approvals GET] query failed", error.message);
      return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
    }

    const transformed = (data || []).map((row: Record<string, unknown>) => {
      const invoice = row.invoices as Record<string, unknown> | null;
      const vendor = invoice?.vendors as Record<string, string> | null;
      return {
        id: row.id,
        invoiceId: row.invoice_id || "",
        vendorName: vendor?.name || "",
        amount: (invoice?.total_amount_micro as number) || 0,
        token: "ALEO",
        status: row.status || "pending",
        requestedBy: row.approver_id || "",
        requestedAt: row.created_at || "",
        description: invoice?.gl_code || "",
      };
    });

    return NextResponse.json({ data: transformed });
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
        console.error("[approvals POST approve] failed", { userId: user.id, approvalId, err: error.message });
        return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
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
        console.error("[approvals POST reject] failed", { userId: user.id, approvalId, err: error.message });
        return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
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
  } catch (err) {
    console.error("[approvals POST] unhandled", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/approvals — attach on-chain metadata to an approval row
 * (the tx hash written by stealthap_wf_v2::approve_private). Called by the
 * approvals page AFTER the on-chain commitment succeeds, so the DB row can
 * be cross-referenced against the explorer.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Missing approval id" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.aleo_tx_id) updates.aleo_tx_id = body.aleo_tx_id;
    if (body.nonce) updates.nonce = body.nonce;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No patchable fields provided" }, { status: 400 });
    }

    // Only the approver of record can stamp on-chain metadata — prevents a
    // malicious caller from attributing someone else's approval tx.
    const { data, error } = await supabase
      .from("approvals")
      .update(updates)
      .eq("id", body.id)
      .eq("approver_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[approvals PATCH] update failed", { userId: user.id, approvalId: body.id, err: error.message });
      return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[approvals PATCH] unhandled", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
  }
}
