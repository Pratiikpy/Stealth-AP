import { createClient } from "@/lib/supabase/client";

export async function getSpendByVendor(months = 6) {
  const supabase = createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data, error } = await supabase
    .from("payments")
    .select("amount_micro, vendors(name)")
    .eq("status", "completed")
    .gte("confirmed_at", since.toISOString());

  if (error) throw error;

  const byVendor: Record<string, number> = {};
  for (const p of data ?? []) {
    const vendorData = p.vendors as unknown as { name: string } | null;
    const name = vendorData?.name ?? "Unknown";
    byVendor[name] = (byVendor[name] ?? 0) + p.amount_micro;
  }

  return Object.entries(byVendor)
    .map(([name, total]) => ({ name, amount_micro: total }))
    .sort((a, b) => b.amount_micro - a.amount_micro);
}

export async function getSpendByMonth(months = 6) {
  const supabase = createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data, error } = await supabase
    .from("payments")
    .select("amount_micro, confirmed_at")
    .eq("status", "completed")
    .gte("confirmed_at", since.toISOString())
    .order("confirmed_at");

  if (error) throw error;

  const byMonth: Record<string, number> = {};
  for (const p of data ?? []) {
    if (!p.confirmed_at) continue;
    const d = new Date(p.confirmed_at);
    const key = d.toLocaleDateString("en-US", { month: "short" });
    byMonth[key] = (byMonth[key] ?? 0) + p.amount_micro;
  }

  return Object.entries(byMonth).map(([month, amount]) => ({
    month,
    amount_micro: amount,
  }));
}

export async function getSpendByCategory() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("payments")
    .select("amount_micro, vendors(category)")
    .eq("status", "completed");

  if (error) throw error;

  const byCategory: Record<string, number> = {};
  for (const p of data ?? []) {
    const vendorData = p.vendors as unknown as { category: string | null } | null;
    const cat = vendorData?.category ?? "Uncategorized";
    byCategory[cat] = (byCategory[cat] ?? 0) + p.amount_micro;
  }

  return Object.entries(byCategory)
    .map(([name, amount]) => ({ name, amount_micro: amount }))
    .sort((a, b) => b.amount_micro - a.amount_micro);
}

export async function getAgingReport() {
  const supabase = createClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("invoices")
    .select("id, total_amount_micro, due_date")
    .in("status", ["pending", "approved"]);

  if (error) throw error;

  const buckets = [
    { range: "0-30 days", count: 0, amount_micro: 0 },
    { range: "31-60 days", count: 0, amount_micro: 0 },
    { range: "61-90 days", count: 0, amount_micro: 0 },
    { range: "90+ days", count: 0, amount_micro: 0 },
  ];

  for (const inv of data ?? []) {
    const due = new Date(inv.due_date);
    const daysOld = Math.floor((now.getTime() - due.getTime()) / 86400000);

    let idx: number;
    if (daysOld <= 30) idx = 0;
    else if (daysOld <= 60) idx = 1;
    else if (daysOld <= 90) idx = 2;
    else idx = 3;

    buckets[idx].count++;
    buckets[idx].amount_micro += inv.total_amount_micro;
  }

  return buckets;
}
