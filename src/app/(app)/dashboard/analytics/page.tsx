"use client";

import { motion } from "framer-motion";
import { useData } from "@/lib/hooks/use-data";
import { formatMicro } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MoneyDisplay } from "@/components/ui/money-display";
import { DollarSign, Building, TrendingUp } from "lucide-react";
import { SkeletonCards } from "@/components/ui/skeleton";
import type { Vendor, Invoice } from "@/lib/types";

/* Fallback analytics computed from mock data */
function buildFallback(vendors: Vendor[], invoices: Invoice[]) {
  const totalSpend = vendors.reduce((s, v) => s + v.totalPaid, 0);
  const paidInvoices = invoices.filter((i) => i.status === "paid" || i.status === "settled");
  const avgInvoice = paidInvoices.length > 0
    ? paidInvoices.reduce((s, i) => s + i.amount, 0) / paidInvoices.length
    : 0;

  const categoryMap: Record<string, number> = {};
  for (const v of vendors) {
    categoryMap[v.category] = (categoryMap[v.category] || 0) + v.totalPaid;
  }

  return {
    totalPaid: totalSpend,
    activeVendors: vendors.length,
    avgInvoice,
    byCategory: Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({ category, total })),
    byVendor: [...vendors]
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 5)
      .map((v) => ({ vendor_name: v.name, category: v.category, total: v.totalPaid })),
    aging: [
      { bucket: "0-30 days", count: invoices.filter((i) => i.status === "pending").length },
      { bucket: "31-60 days", count: 0 },
      { bucket: "61-90 days", count: 0 },
      { bucket: "90+ days", count: 0 },
    ],
  };
}

type AnalyticsData = ReturnType<typeof buildFallback>;

const CATEGORY_COLORS = ["bg-[#C6F15C]", "bg-[#B3A0FF]", "bg-[#FF90E8]", "bg-[#C6F15C]", "bg-[#B3A0FF]"];

export default function AnalyticsPage() {
  const { data: vendors } = useData<Vendor[]>("/api/vendors", []);
  const { data: invoices, loading } = useData<Invoice[]>("/api/invoices", []);
  // Empty fallback keeps the UI rendering during load; real analytics comes
  // from the /api/analytics endpoint. Previously we seeded with mock data
  // which showed fictional "Aleo Infrastructure Co." etc. if the API erred.
  const fallback = buildFallback([], []);

  const { data: analytics, isReal } = useData<AnalyticsData>("/api/analytics", fallback);

  const maxCategory = analytics.byCategory[0]?.total || 1;

  const statCards = [
    { label: "Total Spend", value: formatMicro(analytics.totalPaid), sub: "all time", icon: DollarSign, bg: "bg-[#C6F15C]" },
    { label: "Active Vendors", value: (analytics.activeVendors ?? vendors.length).toString(), sub: "currently active", icon: Building, bg: "bg-[#B3A0FF]" },
    { label: "Avg Invoice", value: formatMicro(analytics.avgInvoice ?? 0), sub: "paid invoices", icon: TrendingUp, bg: "bg-white" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Spend Analytics"
      />

      {loading ? (
        <div className="mb-8"><SkeletonCards count={3} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {statCards.map((card) => (
            <div key={card.label} className={`${card.bg} border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-black/60">{card.label}</span>
                <card.icon className="w-5 h-5 text-black" />
              </div>
              <p className="text-[28px] font-mono font-black leading-[1] tracking-tight text-black tabular-nums">
                {card.value}
              </p>
              <p className="font-mono text-[11px] text-black/50 mt-1 uppercase tracking-wider">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Spend by category */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="px-4 py-3 border-b-2 border-black flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Spend by category</span>
            {isReal && (
              <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
                Live
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {analytics.byCategory.map(({ category, total }, idx) => (
              <div key={category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-mono text-black">{category}</span>
                  <span className="text-[12px] font-mono text-black font-bold tabular-nums">
                    {formatMicro(total)}
                  </span>
                </div>
                <div className="h-4 border-2 border-black bg-[#E5E5E5] overflow-hidden">
                  <motion.div
                    className={`h-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(total / maxCategory) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spend by vendor */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="px-4 py-3 border-b-2 border-black">
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Top vendors</span>
          </div>
          <div className="p-4 space-y-0">
            {analytics.byVendor.map((v, i) => (
              <div
                key={v.vendor_name}
                className="flex items-center gap-3 py-2.5 border-b-2 border-black last:border-0"
              >
                <span className="font-mono text-[13px] text-black font-black w-5 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-mono text-black font-bold truncate">{v.vendor_name}</div>
                  {v.category && <div className="text-[11px] font-mono text-black/50 uppercase">{v.category}</div>}
                </div>
                <MoneyDisplay amount={v.total} token="ALEO" className="text-black font-mono font-bold text-[13px]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Aging report */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="px-4 py-3 border-b-2 border-black">
          <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Aging report</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {analytics.aging.map((b) => (
              <div key={b.bucket} className="border-2 border-black p-4 text-center bg-[#F5F5F4]">
                <div className="text-[24px] font-mono font-black text-black tabular-nums">{b.count}</div>
                <div className="text-[11px] font-mono text-black/50 mt-0.5 uppercase tracking-wider">{b.bucket}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
