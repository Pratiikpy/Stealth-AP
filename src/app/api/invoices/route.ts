import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // request.nextUrl returns a NextURL; its searchParams property is a
    // synchronous URLSearchParams. The Next.js 16 async-searchParams change
    // only affects page-prop searchParams, not NextRequest.
    const sp = request.nextUrl.searchParams;

    const status = sp.get("status") || "all";
    const search = sp.get("search") || "";
    const cleanSearch = search?.replace(/[%_(),.]/g, '') || '';
    const limit = parseInt(sp.get("limit") || "50");
    const offset = parseInt(sp.get("offset") || "0");

    // Fetch invoices with the vendor join only — a stable, well-tested
    // relationship. The approvals join was previously embedded here and
    // caused the entire GET to 500 on some Supabase schemas where the
    // reverse FK wasn't named as Postgrest expected, which in turn made
    // every page fall back to the mock-data seed. Approvals are now
    // fetched in a second, independent query and merged client-side.
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
      console.error("[invoices GET] query failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
    }

    // Second query — fetch approvals for the returned invoices. If this
    // errors (e.g. RLS misconfigured), we degrade gracefully: invoices
    // still return, approvals attached as [].
    const invoiceIds = (data ?? []).map((r: Record<string, unknown>) => r.id as string).filter(Boolean);
    let approvalsByInvoice: Record<string, Array<{ aleo_tx_id: string | null; status: string; decided_at: string | null }>> = {};
    if (invoiceIds.length > 0) {
      const { data: approvalRows, error: approvalsErr } = await supabase
        .from("approvals")
        .select("invoice_id, aleo_tx_id, status, decided_at")
        .in("invoice_id", invoiceIds);
      if (approvalsErr) {
        console.warn("[invoices GET] approvals join failed (non-fatal)", approvalsErr.message);
      } else if (approvalRows) {
        for (const r of approvalRows) {
          const iid = r.invoice_id as string;
          if (!approvalsByInvoice[iid]) approvalsByInvoice[iid] = [];
          approvalsByInvoice[iid].push({
            aleo_tx_id: r.aleo_tx_id,
            status: r.status,
            decided_at: r.decided_at,
          });
        }
      }
    }

    // Transform DB rows to match frontend Invoice type (camelCase). ALSO keep
    // the snake_case `vendor_id` and nested `vendors` join — the payment-flow
    // code reads `firstInv.vendor_id` + `firstInv.vendors.payment_address`
    // directly when calling PATCH /api/vendors. Without these, the vendor
    // address PATCH silently no-ops and the user is re-asked on every
    // payment for the same vendor.
    const transformed = (data || []).map((row: Record<string, unknown>) => ({
      id: row.invoice_number || row.id,
      vendorId: row.vendor_id || "",
      vendor_id: row.vendor_id || "",
      vendorName: (row.vendors as Record<string, string>)?.name || (row.extracted_data as Record<string, string>)?.vendor_name || "",
      vendors: row.vendors || null,
      amount: (row.amount_micro as number) || 0,
      token: row.token || "ALEO",
      status: row.status || "draft",
      dueDate: row.due_date || "",
      createdAt: row.created_at || "",
      description: (row.extracted_data as Record<string, string>)?.notes || "",
      approvalChain: [],
      txHash: row.aleo_tx_id || undefined,
      invoice_hash: row.invoice_hash || null,
      total_micro: (row.total_amount_micro as number) || (row.amount_micro as number) || 0,
      approvals: approvalsByInvoice[row.id as string] || [],
      _raw: row,
    }));

    console.log("[invoices GET]", { userId: user.id, count, ms: Date.now() - startedAt });
    return NextResponse.json({ data: transformed, count });
  } catch (err) {
    console.error("[invoices GET] failed", { ms: Date.now() - startedAt, err: err instanceof Error ? err.message : err });
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

    let { data: profile } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      // Auto-create profile if missing (safety net)
      const companyId = await ensureProfile(user.id, user.email!);
      if (!companyId) {
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
      profile = { company_id: companyId };
    }

    const body = await request.json();

    // Duplicate-invoice protection. Every real AP system has this — prevents
    // paying the same vendor twice for the same invoice number + amount.
    // We use a cheap DB check (fingerprint on {company, vendor, invoice_number,
    // total}) before the insert; on-chain `inv_v2::check_duplicate` is called
    // by the frontend during commitment. Two layers, one catches typos, the
    // other catches replay attacks.
    if (body.vendor_id && body.invoice_number) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("company_id", profile.company_id)
        .eq("vendor_id", body.vendor_id)
        .eq("invoice_number", body.invoice_number)
        .maybeSingle();
      if (existing) {
        console.warn("[invoices POST] duplicate blocked", {
          userId: user.id,
          existingId: existing.id,
          invoice_number: body.invoice_number,
        });
        return NextResponse.json(
          {
            error: `Invoice ${body.invoice_number} already exists for this vendor.`,
            duplicate: true,
            existing_id: existing.id,
          },
          { status: 409 }
        );
      }
    }

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
        status: "pending",
        company_id: profile.company_id,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[invoices POST] insert failed", { userId: user.id, err: error.message, details: error.details, hint: error.hint });
      return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
    }

    // Auto-create approval record so invoice appears in /approvals
    if (data) {
      await supabase.from("approvals").insert({
        invoice_id: data.id,
        approver_id: user.id,
        status: "pending",
      });
    }

    console.log("[invoices POST] created", { invoiceId: data?.id });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[invoices POST] failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create invoice" },
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
      console.error("[invoices PATCH] update failed", { userId: user.id, invoiceId: body.id, err: error.message });
      return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
    }

    // When invoice is submitted for approval, auto-create approval record
    if (body.status === "pending" && data) {
      const { createServerClient } = await import("@supabase/ssr");
      const adminClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll() { return []; }, setAll() {} } }
      );
      await adminClient.from("approvals").insert({
        invoice_id: body.id,
        approver_id: user.id,
        status: "pending",
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[invoices PATCH] failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}
