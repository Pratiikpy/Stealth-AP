"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import type { Invoice } from "@/lib/types";
import { useData } from "@/lib/hooks/use-data";
import { formatMicro, formatDate } from "@/lib/utils";
import { Plus, ArrowUpRight, TrendingUp, Clock, CheckCircle2, Users } from "lucide-react";
import { SkeletonTable, SkeletonCards } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const invoiceColumns: Column<Invoice>[] = [
  {
    key: "id",
    label: "Invoice",
    sortable: true,
    render: (row: Invoice) => <span className="font-mono font-bold text-black">{row.id}</span>,
  },
  {
    key: "vendorName",
    label: "Vendor",
    sortable: true,
    render: (row: Invoice) => <span className="font-mono text-black">{row.vendorName}</span>,
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    className: "text-right",
    render: (row: Invoice) => <MoneyDisplay amount={row.amount} token={row.token} />,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row: Invoice) => <Badge status={row.status} />,
  },
  {
    key: "dueDate",
    label: "Due",
    sortable: true,
    render: (row: Invoice) => <span className="font-mono text-black/60">{formatDate(row.dueDate)}</span>,
  },
];

export default function DashboardPage() {
  // Fetch the full invoice set (up to the DB default of 200) so totals /
  // counts reflect ALL user invoices, not just the eight we happen to show
  // in "Recent." Previously the stat cards were summing over a capped
  // window, so a paid invoice beyond index 8 would never appear in
  // "Total Settled" even though it was paid.
  const { data: invoices, loading, isReal, refresh } = useData<Invoice[]>("/api/invoices?limit=200", []);

  // One-shot reconciliation on first mount — scans the user's invoices
  // against their payment rows and flips any stuck-as-"approved" invoices
  // to "paid" if a settled payment exists. Covers rows created before the
  // /api/payments status-update fix landed. Silent no-op if nothing is
  // out of sync.
  const didReconcile = useRef(false);
  useEffect(() => {
    if (didReconcile.current) return;
    didReconcile.current = true;
    (async () => {
      try {
        const res = await fetch("/api/invoices/reconcile", {
          method: "POST",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json() as { updated?: number };
        if (json.updated && json.updated > 0) {
          // Something moved — refetch invoices so the new stats render.
          refresh();
        }
      } catch {
        // Silent — reconcile is a convenience, not a requirement.
      }
    })();
  }, [refresh]);
  // The "Recent Invoices" card shows the eight most-recent; the list is
  // already sorted DESC by created_at at the API layer.
  const recentInvoices = invoices.slice(0, 8);

  const pendingCount = invoices.filter((i) => i.status === "pending").length;
  const approvedCount = invoices.filter((i) => i.status === "approved").length;
  const activeVendorSet = new Set(invoices.map((i) => i.vendorId).filter(Boolean));
  const totalPayable = invoices
    .filter((i) => i.status === "pending" || i.status === "approved")
    .reduce((sum, i) => sum + i.amount, 0);
  const totalSettled = invoices
    .filter((i) => i.status === "paid" || i.status === "settled")
    .reduce((sum, i) => sum + i.amount, 0);

  const metricCards = [
    { label: "Pending Invoices", value: pendingCount + approvedCount, icon: TrendingUp, bg: "bg-[#C6F15C]", isCount: true },
    { label: "Total Payable", value: totalPayable, icon: Clock, bg: "bg-[#B3A0FF]", isCount: false },
    { label: "Total Settled", value: totalSettled, icon: CheckCircle2, bg: "bg-white", isCount: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Overview"
        description="Treasury operations at a glance"
        action={
          <Link href="/payables">
            <button className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </button>
          </Link>
        }
      />

      {/* Metric cards */}
      {loading ? (
        <div className="mb-8"><SkeletonCards count={3} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {metricCards.map((metric) => (
            <div key={metric.label} className={`${metric.bg} border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5`}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-black/60">{metric.label}</span>
                <metric.icon className="w-5 h-5 text-black" />
              </div>
              <p className="text-[32px] font-mono font-black leading-[1] tracking-tight text-black tabular-nums">
                {metric.isCount ? metric.value : formatMicro(metric.value, 0)}
              </p>
              {!metric.isCount && <p className="font-mono text-[11px] text-black/50 mt-1 uppercase tracking-wider">ALEO</p>}
            </div>
          ))}
        </div>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-black" />
            <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-black/60">Pending Approvals</span>
          </div>
          <p className="text-[28px] font-mono font-black tracking-tight text-black">{pendingCount}</p>
        </div>
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-black" />
            <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-black/60">Active Vendors</span>
          </div>
          <p className="text-[28px] font-mono font-black tracking-tight text-black">{activeVendorSet.size}</p>
        </div>
      </div>

      {/* Recent invoices table */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-3xl font-black uppercase tracking-tighter text-black">Recent Invoices</h2>
            {isReal && (
              <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
                Live
              </span>
            )}
          </div>
          <Link href="/payables" className="font-mono uppercase font-bold text-[12px] text-black border-b-2 border-black hover:text-black/70 flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : invoices.length === 0 ? (
          <p className="py-12 font-mono text-[13px] text-black/40 text-center uppercase">No invoices yet</p>
        ) : (
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden">
            <DataTable
              columns={invoiceColumns}
              data={recentInvoices}
              getRowKey={(row: Invoice) => row.id}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
