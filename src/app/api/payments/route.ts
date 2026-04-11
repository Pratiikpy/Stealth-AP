import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("payments")
      .select("*, invoices(invoice_number), vendors(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch payments" },
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

    const { data: profile } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();

    // Verify invoice exists and is in "approved" status before marking as paid
    if (body.invoice_id) {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("id", body.invoice_id)
        .single();

      if (invoiceError || !invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }

      if (invoice.status !== "approved") {
        return NextResponse.json(
          { error: `Invoice must be approved before payment. Current status: ${invoice.status}` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        invoice_id: body.invoice_id,
        vendor_id: body.vendor_id,
        amount_micro: body.amount_micro,
        token: body.token,
        status: "pending",
        aleo_tx_id: body.aleo_tx_id,
        settlement_anchor: body.settlement_anchor,
        company_id: profile.company_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update invoice status to paid
    if (body.invoice_id) {
      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          aleo_tx_id: body.aleo_tx_id,
        })
        .eq("id", body.invoice_id);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
