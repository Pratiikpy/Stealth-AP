import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 30;

/**
 * Invoice ↔ payment reconciliation.
 *
 * Scans the caller's invoices and, for any that are still marked
 * "approved" or "pending" but have a matching payment row with status
 * "settled" or "completed", flips the invoice to "paid" and copies
 * the payment's tx hash onto the invoice.
 *
 * Exists because earlier builds of /api/payments POST didn't update
 * the invoice status on-chain settlement, leaving rows stuck in
 * "approved" even though the payment landed. New payments update
 * correctly (commit d76c4be), but pre-fix invoices need a sync.
 *
 * Idempotent — running it twice on already-paid invoices is a no-op.
 *
 * POST /api/invoices/reconcile
 * Response: { updated: number, details: Array<{invoice_id, tx_hash}> }
 */
export async function POST() {
  const startedAt = Date.now();
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
      .maybeSingle();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    // Find candidates: invoices still pending/approved, scoped to this
    // user's company via RLS + explicit filter.
    const { data: candidates, error: invErr } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("company_id", profile.company_id)
      .in("status", ["approved", "pending"]);
    if (invErr) {
      console.error("[invoices/reconcile] invoice lookup", invErr.message);
      return NextResponse.json({ error: "Failed to scan invoices" }, { status: 500 });
    }
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ updated: 0, details: [] });
    }

    const ids = candidates.map((c) => c.id as string);

    // For each candidate, look for a settled payment row. We grab ALL
    // matching rows in one round trip and group in memory.
    const { data: payments, error: payErr } = await supabase
      .from("payments")
      .select("invoice_id, status, aleo_tx_id, confirmed_at")
      .in("invoice_id", ids)
      .in("status", ["settled", "completed"]);
    if (payErr) {
      console.error("[invoices/reconcile] payment lookup", payErr.message);
      return NextResponse.json({ error: "Failed to scan payments" }, { status: 500 });
    }

    const latestByInvoice = new Map<string, { tx_hash: string | null; confirmed_at: string | null }>();
    for (const p of payments ?? []) {
      const iid = p.invoice_id as string;
      const prev = latestByInvoice.get(iid);
      // Keep the most recently confirmed tx per invoice if multiple exist.
      if (!prev || (p.confirmed_at && (!prev.confirmed_at || p.confirmed_at > prev.confirmed_at))) {
        latestByInvoice.set(iid, {
          tx_hash: (p.aleo_tx_id as string) ?? null,
          confirmed_at: (p.confirmed_at as string) ?? null,
        });
      }
    }

    const details: Array<{ invoice_id: string; tx_hash: string | null }> = [];
    for (const [iid, info] of latestByInvoice) {
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: info.confirmed_at ?? new Date().toISOString(),
          aleo_tx_id: info.tx_hash,
        })
        .eq("id", iid);
      if (updErr) {
        console.warn("[invoices/reconcile] update failed", { iid, err: updErr.message });
        continue;
      }
      details.push({ invoice_id: iid, tx_hash: info.tx_hash });
    }

    console.log("[invoices/reconcile]", {
      userId: user.id,
      scanned: ids.length,
      updated: details.length,
      ms: Date.now() - startedAt,
    });
    return NextResponse.json({ updated: details.length, details });
  } catch (err) {
    console.error("[invoices/reconcile] unhandled", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
