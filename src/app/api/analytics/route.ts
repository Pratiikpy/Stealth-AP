import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    // Fetch settled/completed payments for analytics. Earlier this only
    // matched "completed" but the pay flow writes "settled" when a tx hash
    // exists — so every successful payment was invisible to analytics.
    const { data: payments } = await supabase
      .from("payments")
      .select("amount_micro, token, confirmed_at, settlement_time_s, gas_fee_micro, vendors(name, category)")
      .in("status", ["completed", "settled"])
      .gte("confirmed_at", sixMonthsAgo.toISOString());

    // Fetch outstanding invoices for aging
    const { data: outstanding } = await supabase
      .from("invoices")
      .select("id, total_amount_micro, due_date")
      .in("status", ["pending", "approved"]);

    // Aggregate by vendor
    const byVendorMap: Record<string, { total: number; category: string }> = {};
    const byCategoryMap: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    let totalPaid = 0;
    let totalGasSaved = 0;
    let totalSettlement = 0;

    for (const p of payments ?? []) {
      totalPaid += p.amount_micro;
      totalSettlement += p.settlement_time_s ?? 0;
      totalGasSaved += (p.amount_micro * 5) / 100 - (p.gas_fee_micro ?? 0);

      const vendorData = p.vendors as unknown as { name: string; category: string | null } | null;
      const name = vendorData?.name ?? "Unknown";
      const cat = vendorData?.category ?? "Uncategorized";

      if (!byVendorMap[name]) {
        byVendorMap[name] = { total: 0, category: cat };
      }
      byVendorMap[name].total += p.amount_micro;

      byCategoryMap[cat] = (byCategoryMap[cat] ?? 0) + p.amount_micro;

      if (p.confirmed_at) {
        const month = new Date(p.confirmed_at).toLocaleDateString("en-US", { month: "short" });
        byMonth[month] = (byMonth[month] ?? 0) + p.amount_micro;
      }
    }

    // Aging buckets
    const aging = [
      { range: "0-30 days", count: 0, amount_micro: 0 },
      { range: "31-60 days", count: 0, amount_micro: 0 },
      { range: "61-90 days", count: 0, amount_micro: 0 },
      { range: "90+ days", count: 0, amount_micro: 0 },
    ];
    for (const inv of outstanding ?? []) {
      const daysOld = Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86400000);
      const idx = daysOld <= 30 ? 0 : daysOld <= 60 ? 1 : daysOld <= 90 ? 2 : 3;
      aging[idx].count++;
      aging[idx].amount_micro += inv.total_amount_micro;
    }

    const paymentCount = (payments ?? []).length;
    const activeVendors = Object.keys(byVendorMap).length;
    const avgInvoice = paymentCount > 0 ? Math.round(totalPaid / paymentCount) : 0;

    console.log("[analytics GET]", {
      userId: user.id,
      paymentCount,
      totalPaid,
      activeVendors,
      ms: Date.now() - startedAt,
    });
    return NextResponse.json({
      totalPaid,
      paymentCount,
      activeVendors,
      avgInvoice,
      avgSettlementSeconds: paymentCount > 0 ? Math.round(totalSettlement / paymentCount) : 0,
      gasSavedMicro: totalGasSaved,
      byVendor: Object.entries(byVendorMap)
        .map(([vendor_name, { total, category }]) => ({ vendor_name, category, total }))
        .sort((a, b) => b.total - a.total),
      byCategory: Object.entries(byCategoryMap)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total),
      byMonth: Object.entries(byMonth).map(([month, amount_micro]) => ({ month, amount_micro })),
      aging,
    });
  } catch (err) {
    console.error("[analytics GET] failed", {
      ms: Date.now() - startedAt,
      err: err instanceof Error ? err.message : err,
    });
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
