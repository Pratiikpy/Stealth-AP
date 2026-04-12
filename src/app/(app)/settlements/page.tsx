"use client";

import { useState, useMemo } from "react";
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
import { CreditCard, Clock, ShieldCheck, Plus, Layers, CheckSquare, Square } from "lucide-react";
import { explorerTxUrl } from "@/lib/format";
import { SkeletonTable, SkeletonCards } from "@/components/ui/skeleton";
import type { Payment, Invoice } from "@/lib/types";
import type { InvoiceRow } from "@/types";
import { useWalletStore } from "@/stores/wallet-store";
import { openEpoch, commitPayment, closeEpoch } from "@/lib/aleo/programs/batch";
import { hashToField, generateNonce } from "@/lib/crypto";
import { toast } from "sonner";

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
  const { data: payments, loading, isReal, refresh: refreshPayments } = useData<Payment[]>("/api/payments", []);
  const { data: invoices, refresh: refreshInvoices } = useData<Invoice[]>("/api/invoices", []);
  const [showPayment, setShowPayment] = useState(false);
  const [showInvoiceSelect, setShowInvoiceSelect] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<InvoiceRow[]>([]);

  // Batch settlement state — when batchMode is true, the invoice selector
  // shows checkboxes and the bottom CTA fires bat_v2 epoch flow.
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<string>("");
  const [batchTxs, setBatchTxs] = useState<Array<{ label: string; hash: string }>>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  async function handleBatchSettle() {
    const wallet = useWalletStore.getState();
    if (!wallet.connected || !wallet.address) {
      toast.error("Connect your wallet first");
      return;
    }
    if (batchSelected.size < 2) {
      toast.error("Select at least 2 invoices for batch settlement");
      return;
    }
    const picks = approvedInvoices.filter((inv) => batchSelected.has(inv.id));
    setBatchRunning(true);
    setBatchProgress("Opening settlement epoch…");
    setBatchTxs([]);

    try {
      const companyHash = await hashToField(wallet.address);
      const epochNumber = BigInt(Date.now()); // epoch keyed by submission time
      const epochIdField = await hashToField(`epoch:${wallet.address}:${epochNumber.toString()}`);

      // Step 1 — open epoch (1 signature)
      const openRes = await openEpoch(companyHash, epochNumber);
      if (!openRes.transactionId) throw new Error(openRes.error || "open_epoch failed");
      setBatchTxs((x) => [...x, { label: "open_epoch", hash: openRes.transactionId! }]);

      // Step 2 — commit each invoice to a slot (N signatures)
      for (let i = 0; i < picks.length; i++) {
        const inv = picks[i];
        const apiInv = inv as Invoice & {
          vendor_name?: string;
          invoice_number?: string;
          total_amount_micro?: number;
          amount_micro?: number;
          vendors?: { payment_address?: string; name?: string };
        };
        const vendorName = apiInv.vendors?.name || apiInv.vendor_name || inv.vendorName || "vendor";
        setBatchProgress(`Committing slot ${i + 1} of ${picks.length} (${vendorName})…`);
        const payee = apiInv.vendors?.payment_address || "";
        if (!payee.startsWith("aleo1")) {
          throw new Error(`${vendorName} has no payment address; skip or fill in first.`);
        }
        const total = apiInv.total_amount_micro ?? apiInv.amount_micro ?? inv.amount ?? 0;
        const invoiceIdField = await hashToField(`${inv.id}:${apiInv.invoice_number || ""}`);
        const res = await commitPayment({
          epochId: epochIdField,
          slot: i,
          invoiceId: invoiceIdField,
          payee,
          amount: BigInt(total),
          token: 0, // ALEO
          nonce: generateNonce(),
        });
        if (!res.transactionId) throw new Error(res.error || `commit_payment slot ${i} failed`);
        setBatchTxs((x) => [...x, { label: `commit_payment · slot ${i}`, hash: res.transactionId! }]);
      }

      // Step 3 — close epoch (1 signature)
      setBatchProgress("Closing epoch…");
      const closeRes = await closeEpoch(companyHash, epochNumber);
      if (!closeRes.transactionId) throw new Error(closeRes.error || "close_epoch failed");
      setBatchTxs((x) => [...x, { label: "close_epoch", hash: closeRes.transactionId! }]);

      setBatchProgress(`Batch settled · ${picks.length} invoices committed in epoch`);
      toastSuccess(
        "Batch settlement complete",
        `${picks.length} invoices committed across ${picks.length + 2} transitions`,
      );
      refreshInvoices();
      refreshPayments();
    } catch (err) {
      setBatchProgress(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      toastError("Batch settlement failed", err instanceof Error ? err.message : String(err));
    } finally {
      setBatchRunning(false);
    }
  }

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
    // Actually check the response — previously this block swallowed 4xx/5xx
    // returns silently (fetch only throws on network failure), so the user
    // saw "Payment saved!" even when the DB save 500'd, leaving "Total
    // Settled" stuck at 0 with no explanation.
    let payOk = false;
    try {
      const res = await fetch("/api/payments", {
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `status ${res.status}` }));
        throw new Error(body.error || `status ${res.status}`);
      }
      payOk = true;
      toastSuccess("Payment saved", "Settlement recorded successfully.");
    } catch (err) {
      toastError(
        "DB save failed — on-chain payment succeeded",
        err instanceof Error ? err.message : "Unknown error. Reload to auto-reconcile.",
      );
    }

    // Reconcile — if the POST above failed, we still have the tx hash.
    // Flip every invoice in the payload to "paid" directly via PATCH so
    // the dashboard reflects the settlement even when /api/payments
    // can't write a row (e.g. RLS block on payments table). Belt-and-
    // suspenders; both should succeed on a healthy deploy.
    if (!payOk && txId) {
      await Promise.all(
        invoices.map((inv) =>
          fetch("/api/invoices", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: inv.id,
              status: "paid",
              aleo_tx_id: txId,
            }),
          }).catch(() => null),
        ),
      );
      // Also fire reconcile in case any payments rows exist from prior
      // partial attempts.
      try {
        await fetch("/api/invoices/reconcile", { method: "POST", cache: "no-store" });
      } catch {
        /* silent — best-effort */
      }
    }

    refreshPayments();
    refreshInvoices();
    setShowPayment(false);
  }

  // Total-settled is reported from two sources so the number is right
  // even if one side lags: payments-row sums PLUS invoice-status sums.
  // De-dup by invoice id so a payment and its paid invoice aren't counted
  // twice. Previously we only counted payments with status="settled" which
  // missed rows where status="completed" (older writes) or where the
  // payment row was never inserted but the invoice was flipped to paid
  // by the reconcile endpoint.
  const totalSettled = (() => {
    let sum = 0;
    const countedInvoices = new Set<string>();
    for (const p of payments) {
      // The Payment type lists a restricted status enum, but the API
      // writes "settled" / "completed" on real payments. Compare via
      // string cast so new statuses (the ones we actually write) match.
      const s = String(p.status);
      if (s !== "settled" && s !== "completed") continue;
      sum += p.amount || 0;
      if (p.invoiceId) countedInvoices.add(p.invoiceId);
    }
    const invArr = (invoices as Array<Invoice & { total_micro?: number }>);
    for (const inv of invArr) {
      if (inv.status !== "paid" && inv.status !== "settled") continue;
      if (countedInvoices.has(inv.id)) continue;
      sum += inv.amount ?? inv.total_micro ?? 0;
    }
    return sum;
  })();

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

      {/* Invoice selection panel — dual mode: single-pay or batch-settle */}
      <SlidePanel
        open={showInvoiceSelect}
        onClose={() => { setShowInvoiceSelect(false); setBatchMode(false); setBatchSelected(new Set()); setBatchTxs([]); setBatchProgress(""); }}
        title={batchMode ? "Batch Settlement" : "Select Invoice to Pay"}
      >
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setBatchMode(false); setBatchSelected(new Set()); }}
              className={`flex-1 border-2 border-black font-mono text-[11px] font-bold uppercase tracking-wider py-2 transition-all ${!batchMode ? "bg-[#C6F15C] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-black/60"}`}
            >
              Single Pay
            </button>
            <button
              onClick={() => setBatchMode(true)}
              className={`flex-1 border-2 border-black font-mono text-[11px] font-bold uppercase tracking-wider py-2 transition-all flex items-center justify-center gap-1 ${batchMode ? "bg-[#B3A0FF] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white text-black/60"}`}
            >
              <Layers size={12} />
              Batch Settle
            </button>
          </div>
          <p className="text-[12px] font-mono text-black/70">
            {batchMode
              ? "Select 2+ invoices to commit as a single private batch epoch (bat_v2). Individual amounts + vendors stay invisible; only the aggregate root reaches chain."
              : "Select an approved invoice to settle privately on-chain."}
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
                const isSelected = batchSelected.has(inv.id);

                if (batchMode) {
                  return (
                    <button
                      key={inv.id}
                      onClick={() => {
                        setBatchSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(inv.id)) next.delete(inv.id);
                          else next.add(inv.id);
                          return next;
                        });
                      }}
                      className={`w-full text-left border-2 border-black p-4 transition-all flex items-start gap-3 ${
                        isSelected ? "bg-[#B3A0FF]/30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white"
                      }`}
                    >
                      {isSelected ? <CheckSquare size={18} className="text-black mt-0.5" /> : <Square size={18} className="text-black/40 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[13px] font-bold text-black">{vendorName}</span>
                          <span className="font-mono text-[14px] font-black text-black tabular-nums">
                            {formatMicro(amount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-black/50">{invoiceNumber}</span>
                          {dueDate && <span className="font-mono text-[11px] text-black/40">Due {formatDate(dueDate)}</span>}
                        </div>
                      </div>
                    </button>
                  );
                }

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

          {/* Batch CTA + progress */}
          {batchMode && (
            <div className="border-2 border-black bg-black text-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#B3A0FF]">
                  Selected: {batchSelected.size}
                </span>
                <span className="font-mono text-[13px] font-black text-[#C6F15C] tabular-nums">
                  Total:{" "}
                  {formatMicro(
                    approvedInvoices
                      .filter((i) => batchSelected.has(i.id))
                      .reduce((s, i) => {
                        const a = i as Invoice & { total_amount_micro?: number; amount_micro?: number };
                        return s + (a.total_amount_micro ?? a.amount_micro ?? i.amount ?? 0);
                      }, 0)
                  )}
                </span>
              </div>

              {batchTxs.length > 0 && (
                <div className="border-2 border-white/20 p-2 space-y-1 font-mono text-[10px]">
                  {batchTxs.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-white/50 w-32 shrink-0">{t.label}:</span>
                      <a
                        href={explorerTxUrl(t.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#C6F15C] underline truncate"
                      >
                        {t.hash.slice(0, 20)}…
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {batchProgress && (
                <p className="font-mono text-[10px] text-white/60 italic">{batchProgress}</p>
              )}

              <button
                onClick={handleBatchSettle}
                disabled={batchRunning || batchSelected.size < 2}
                className="w-full bg-[#B3A0FF] text-black border-2 border-black font-mono uppercase font-bold tracking-wider py-2.5 text-sm shadow-[3px_3px_0px_0px_rgba(255,255,255,0.3)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <Layers size={14} />
                {batchRunning ? "Settling epoch…" : `Settle ${batchSelected.size} invoices privately`}
              </button>

              <p className="font-mono text-[9px] text-white/40">
                Note: one wallet signature per transition (open_epoch + 1 per invoice + close_epoch).
                True single-sig atomic batching requires contract-level aggregation — roadmap item.
              </p>
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
