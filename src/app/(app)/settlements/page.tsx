"use client";

import { useState, useMemo } from "react";
import { payments as mockPayments } from "@/lib/mock-data";
import { invoices as mockInvoices } from "@/lib/mock-data";
import { useData } from "@/lib/hooks/use-data";
import { formatDate, formatMicro, shortHash } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { SlidePanel } from "@/components/ui/slide-panel";
import { PaymentFlow } from "@/components/payments/payment-flow";
import { motion } from "framer-motion";
import { CreditCard, Clock, ShieldCheck, Plus } from "lucide-react";
import { SkeletonTable, SkeletonCards } from "@/components/ui/skeleton";
import type { Payment, Invoice } from "@/lib/types";
import type { InvoiceRow } from "@/types";

const paymentColumns: Column<Payment>[] = [
  {
    key: "id",
    label: "Payment",
    sortable: true,
    render: (row: Payment) => (
      <span className="font-mono text-black font-bold text-[12px]">{row.id}</span>
    ),
  },
  {
    key: "vendorName",
    label: "Vendor",
    sortable: true,
    render: (row: Payment) => (
      <span className="font-mono text-black font-medium">{row.vendorName}</span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    className: "text-right",
    render: (row: Payment) => (
      <MoneyDisplay amount={row.amount} token={row.token} className="text-black font-mono font-bold" />
    ),
  },
  {
    key: "token",
    label: "Token",
    render: (row: Payment) => (
      <span className="font-mono text-black/50 text-[12px] uppercase">{row.token}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row: Payment) => <Badge status={row.status} />,
  },
  {
    key: "txHash",
    label: "TX Hash",
    render: (row: Payment) =>
      row.txHash ? (
        <span className="font-mono text-black/50 text-[11px]">{shortHash(row.txHash)}</span>
      ) : (
        <span className="font-mono text-black/30 text-[11px]">&mdash;</span>
      ),
  },
  {
    key: "settledAt",
    label: "Confirmed",
    sortable: true,
    render: (row: Payment) =>
      row.settledAt ? (
        <span className="font-mono text-black/60 text-[12px]">{formatDate(row.settledAt)}</span>
      ) : (
        <span className="font-mono text-black/30 text-[11px]">&mdash;</span>
      ),
  },
];

export default function SettlementsPage() {
  const { data: payments, loading, isReal, refresh: refreshPayments } = useData<Payment[]>("/api/payments", mockPayments);
  const { data: invoices, refresh: refreshInvoices } = useData<Invoice[]>("/api/invoices", mockInvoices);
  const [showPayment, setShowPayment] = useState(false);
  const [showInvoiceSelect, setShowInvoiceSelect] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<InvoiceRow[]>([]);

  // The API attaches the joined `vendors` row on `_raw`. Use it to find
  // each invoice's payee address for filtering/payment.
  type InvoiceWithRaw = Invoice & {
    _raw?: { vendors?: { name?: string; payment_address?: string } };
  };

  function getPaymentAddress(inv: Invoice): string | null {
    const withVendors = inv as Invoice & { vendors?: { payment_address?: string } };
    return withVendors.vendors?.payment_address || null;
  }

  // Get approved invoices. Payment address check happens at settlement time.
  const approvedInvoices = useMemo(
    () => invoices.filter((inv) => inv.status === "approved"),
    [invoices]
  );

  function handleSelectInvoice(inv: Invoice) {
    const payeeAddress = getPaymentAddress(inv);
    // Handle both API (snake_case) and mock (camelCase) field formats
    const apiInv = inv as Invoice & {
      invoice_number?: string;
      vendor_id?: string;
      amount_micro?: number;
      total_amount_micro?: number;
      due_date?: string;
      created_at?: string;
      vendors?: { name?: string; payment_address?: string };
    };
    const vendorName = apiInv.vendors?.name || inv.vendorName || "—";
    const amount = apiInv.total_amount_micro ?? apiInv.amount_micro ?? inv.amount ?? 0;
    const dueDate = apiInv.due_date || inv.dueDate || "";
    const createdAt = apiInv.created_at || inv.createdAt || "";
    const invoiceNumber = apiInv.invoice_number || inv.id;

    const row: InvoiceRow & { vendors?: { payment_address?: string; name?: string } } = {
      id: inv.id,
      company_id: "",
      invoice_number: invoiceNumber,
      vendor_id: apiInv.vendor_id || inv.vendorId,
      vendor_name: vendorName,
      amount_micro: amount,
      tax_micro: 0,
      total_micro: amount,
      currency: (inv.token as "ALEO" | "USDCx" | "USAD") || "ALEO",
      issue_date: createdAt,
      due_date: dueDate,
      line_items: [],
      pdf_url: null,
      po_number: null,
      notes: null,
      status: inv.status as "approved",
      gl_code: null,
      created_by: "",
      approved_by: null,
      approved_at: null,
      paid_at: null,
      aleo_record_id: null,
      invoice_hash: inv.txHash ?? null,
      created_at: createdAt,
      updated_at: createdAt,
      vendors: payeeAddress
        ? { payment_address: payeeAddress, name: vendorName }
        : undefined,
    };
    setSelectedInvoices([row]);
    setShowInvoiceSelect(false);
    setShowPayment(true);
  }

  function handleNewPayment() {
    if (approvedInvoices.length === 0) {
      setSelectedInvoices([]);
      setShowPayment(true);
    } else {
      setShowInvoiceSelect(true);
    }
  }

  async function handlePaymentSuccess(invoices: InvoiceRow[], txId?: string) {
    try {
      await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_ids: invoices.map((inv) => inv.id),
          vendor_id: invoices[0]?.vendor_id ?? null,
          total_micro: invoices.reduce((sum, inv) => sum + inv.total_micro, 0),
          token: "ALEO",
          tx_hash: txId ?? null,
          status: "settled",
        }),
      });
      toastSuccess("Payment saved", "Settlement recorded successfully.");
    } catch {
      toastError("Failed to save payment", "The on-chain payment succeeded but the DB record was not saved. Please contact support.");
    }
    // Refresh BOTH lists — payments for the history table, invoices so the
    // just-paid invoice drops out of the "Select Invoice to Pay" selector.
    refreshPayments();
    refreshInvoices();
    setShowPayment(false);
  }

  const totalSettled = payments
    .filter((p) => p.status === "settled")
    .reduce((sum, p) => sum + p.amount, 0);

  const zkProofCount = payments.filter((p) => p.zkProof).length;

  const avgSettlementTime = (() => {
    const settled = payments.filter((p) => p.settledAt && p.initiatedAt);
    if (settled.length === 0) return "\u2014";
    const totalSeconds = settled.reduce((sum, p) => {
      const start = new Date(p.initiatedAt).getTime();
      const end = new Date(p.settledAt!).getTime();
      return sum + (end - start) / 1000;
    }, 0);
    const avg = Math.round(totalSeconds / settled.length);
    const minutes = Math.floor(avg / 60);
    const seconds = avg % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  })();

  const statCards = [
    { label: "Total Settled", value: formatMicro(totalSettled), sub: "ALEO", icon: CreditCard, bg: "bg-[#C6F15C]" },
    { label: "Avg Settlement Time", value: avgSettlementTime, sub: avgSettlementTime === "\u2014" ? "no settled payments" : "across all payments", icon: Clock, bg: "bg-[#B3A0FF]" },
    { label: "ZK Proofs Generated", value: zkProofCount.toString(), sub: "verified on-chain", icon: ShieldCheck, bg: "bg-white" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1100px]"
    >
      <PageHeader
        title="Settlements"
        description="Every payment settles privately. Only hashes on-chain."
        action={
          <button
            onClick={handleNewPayment}
            className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Payment
          </button>
        }
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

      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-mono text-xl font-black uppercase tracking-wider text-black">Payment History</h2>
        {isReal && (
          <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
            Live
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : payments.length === 0 ? (
        <p className="py-12 font-mono text-[13px] text-black/40 text-center uppercase">No payments yet</p>
      ) : (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden">
          <DataTable
            columns={paymentColumns}
            data={payments}
            getRowKey={(row: Payment) => row.id}
          />
        </div>
      )}

      {/* Invoice selection panel */}
      <SlidePanel
        open={showInvoiceSelect}
        onClose={() => setShowInvoiceSelect(false)}
        title="Select Invoice to Pay"
      >
        <div className="space-y-3">
          <p className="text-[13px] font-mono text-black/70">
            Select an approved invoice to settle on-chain.
          </p>
          {approvedInvoices.length === 0 ? (
            <p className="py-8 font-mono text-[13px] text-black/40 text-center uppercase">
              No approved invoices ready for payment
            </p>
          ) : (
            <div className="space-y-2">
              {approvedInvoices.map((inv) => {
                const apiInv = inv as Invoice & {
                  invoice_number?: string;
                  total_amount_micro?: number;
                  amount_micro?: number;
                  due_date?: string;
                  vendors?: { name?: string };
                };
                const vendorName = apiInv.vendors?.name || inv.vendorName || "—";
                const amount = apiInv.total_amount_micro ?? apiInv.amount_micro ?? inv.amount ?? 0;
                const dueDate = apiInv.due_date || inv.dueDate || "";
                const invoiceNumber = apiInv.invoice_number || inv.id;
                return (
                  <button
                    key={inv.id}
                    onClick={() => handleSelectInvoice(inv)}
                    className="w-full text-left bg-white border-2 border-black p-4 hover:bg-[#C6F15C]/20 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[13px] font-bold text-black">{vendorName}</span>
                      <span className="font-mono text-[14px] font-black text-black tabular-nums">
                        {formatMicro(amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-black/50">{invoiceNumber}</span>
                      {dueDate && (
                        <span className="font-mono text-[11px] text-black/40">Due {formatDate(dueDate)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SlidePanel>

      {/* Payment flow panel */}
      <SlidePanel
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="New Payment"
      >
        <PaymentFlow
          invoices={selectedInvoices}
          onClose={() => setShowPayment(false)}
          onComplete={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
          onVendorUpdated={refreshInvoices}
        />
      </SlidePanel>
    </motion.div>
  );
}
