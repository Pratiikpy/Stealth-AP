import { ensureProfile } from "@/lib/supabase/ensure-profile";
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
      console.error("[payments GET] query failed", error.message);
      return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
    }

    const transformed = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      invoiceId: row.invoice_id || "",
      vendorName: (row.vendors as Record<string, string>)?.name || "",
      amount: (row.amount_micro as number) || 0,
      token: row.token || "ALEO",
      status: row.status || "pending",
      initiatedAt: row.created_at || "",
      settledAt: row.confirmed_at || undefined,
      txHash: row.aleo_tx_id || undefined,
      zkProof: row.aleo_payment_id || undefined,
    }));

    return NextResponse.json({ data: transformed });
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

    let { data: profile } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      const companyId = await ensureProfile(user.id, user.email!);
      if (!companyId) return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      profile = { company_id: companyId };
    }

    const body = await request.json();

    // Accept either invoice_id (singular, legacy) or invoice_ids (array,
    // used by the settlements multi-invoice payment flow). The frontend
    // always sends invoice_ids; the old single-id path was never updating
    // invoice status because body.invoice_id was undefined, so paid
    // invoices stayed "approved" and kept appearing in Select-to-Pay.
    const invoiceIds: string[] = Array.isArray(body.invoice_ids)
      ? body.invoice_ids.filter((x: unknown) => typeof x === "string")
      : body.invoice_id
      ? [body.invoice_id]
      : [];

    // Status writes: treat the payment as `settled` when the tx has been
    // submitted to chain and a tx hash exists; analytics filters on this.
    const status = body.status || (body.tx_hash || body.aleo_tx_id ? "settled" : "pending");
    const txHash = body.tx_hash || body.aleo_tx_id || null;
    const totalMicro = body.total_micro ?? body.amount_micro ?? 0;

    // Verify every invoice in the payload belongs to this company and is
    // in "approved" status before touching anything.
    if (invoiceIds.length > 0) {
      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select("id, status, total_amount_micro, vendor_id")
        .in("id", invoiceIds);

      if (invErr || !invoices || invoices.length !== invoiceIds.length) {
        console.error("[payments POST] invoice lookup failed", { userId: user.id, invoiceIds, err: invErr?.message });
        return NextResponse.json({ error: "One or more invoices not found" }, { status: 404 });
      }
      for (const inv of invoices) {
        if (inv.status !== "approved" && inv.status !== "pending") {
          return NextResponse.json(
            { error: `Invoice ${inv.id} is ${inv.status}; cannot pay` },
            { status: 400 }
          );
        }
      }
    }

    // One payment row per invoice (simpler for reporting; analytics counts rows).
    const rows = invoiceIds.length > 0
      ? invoiceIds.map((invoice_id) => ({
          invoice_id,
          vendor_id: body.vendor_id ?? null,
          amount_micro: totalMicro,
          token: body.token || "ALEO",
          status,
          aleo_tx_id: txHash,
          settlement_anchor: body.settlement_anchor ?? null,
          confirmed_at: status === "settled" ? new Date().toISOString() : null,
          company_id: profile.company_id,
          created_by: user.id,
        }))
      : [{
          invoice_id: null,
          vendor_id: body.vendor_id ?? null,
          amount_micro: totalMicro,
          token: body.token || "ALEO",
          status,
          aleo_tx_id: txHash,
          settlement_anchor: body.settlement_anchor ?? null,
          confirmed_at: status === "settled" ? new Date().toISOString() : null,
          company_id: profile.company_id,
          created_by: user.id,
        }];

    const { data, error } = await supabase.from("payments").insert(rows).select();

    if (error) {
      console.error("[payments POST] insert failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }

    // Flip ALL referenced invoices to "paid". Also filter by company_id so
    // RLS-missing scenarios don't silently no-op. If the update touches
    // zero rows (e.g. permissions block), we log it explicitly so the
    // symptom "Total Settled stuck at 0" is diagnosable.
    if (invoiceIds.length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          aleo_tx_id: txHash,
        })
        .in("id", invoiceIds)
        .eq("company_id", profile.company_id)
        .select("id");
      if (updErr) {
        console.error("[payments POST] invoice status update failed", { userId: user.id, err: updErr.message });
      } else if (!updated || updated.length === 0) {
        console.warn("[payments POST] invoice status update hit 0 rows", { userId: user.id, invoiceIds, company_id: profile.company_id });
      } else {
        console.log("[payments POST] flipped invoices to paid", { count: updated.length });
      }
    }

    console.log("[payments POST] settled", { userId: user.id, invoiceIds, txHash, count: rows.length });
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
