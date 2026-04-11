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

    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const cleanSearch = search?.replace(/[%_(),.]/g, '') || '';
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("invoices")
      .select("*, vendors(name, payment_address)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (cleanSearch) {
      query = query.or(
        `invoice_number.ilike.%${cleanSearch}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
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

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: body.invoice_number,
        vendor_id: body.vendor_id,
        amount_micro: body.amount_micro,
        tax_amount_micro: body.tax_amount_micro || 0,
        total_amount_micro: body.total_amount_micro,
        currency: body.currency || "USD",
        token: body.token || "ALEO",
        issue_date: body.issue_date,
        due_date: body.due_date,
        line_items: body.line_items || [],
        gl_code: body.gl_code,
        po_number: body.po_number,
        notes: body.notes,
        pdf_path: body.pdf_path,
        pdf_hash: body.pdf_hash,
        confidence_score: body.confidence_score,
        extracted_data: body.extracted_data,
        status: "draft",
        company_id: profile.company_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Missing invoice id" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.aleo_tx_id) updates.aleo_tx_id = body.aleo_tx_id;
    if (body.aleo_invoice_id) updates.aleo_invoice_id = body.aleo_invoice_id;
    if (body.status) updates.status = body.status;
    if (body.invoice_hash) updates.invoice_hash = body.invoice_hash;

    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}
