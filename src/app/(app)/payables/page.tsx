"use client";

import { useState, useMemo, useCallback } from "react";
import { invoices as mockInvoices } from "@/lib/mock-data";
import { useData } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/utils";
import { toastSuccess } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidePanel } from "@/components/ui/slide-panel";
import { FileUploadZone } from "@/components/invoices/file-upload-zone";
import { motion } from "framer-motion";
import { Plus, Upload, Sparkles, Search, CheckCircle2, PenLine } from "lucide-react";
import { SkeletonTable } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { createInvoiceOnChain } from "@/lib/aleo/programs/invoice";
import { useWalletStore } from "@/stores/wallet-store";
import { hashToField, generateNonce, nowTimestamp } from "@/lib/crypto";
import type { Invoice } from "@/lib/types";
import type { InvoiceExtraction } from "@/types";

type FilterKey = "all" | "pending" | "approved" | "paid";

const filterKeys: FilterKey[] = ["all", "pending", "approved", "paid"];

function filterLabel(key: FilterKey, count: number): string {
  const labels: Record<FilterKey, string> = {
    all: "All",
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
  };
  return `${labels[key]} (${count})`;
}

function matchesFilter(invoice: Invoice, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return invoice.status === "paid" || invoice.status === "settled";
  return invoice.status === filter;
}

const invoiceColumns: Column<Invoice>[] = [
  {
    key: "id",
    label: "Invoice",
    sortable: true,
    render: (row: Invoice) => (
      <span className="font-mono text-black font-bold text-[12px]">{row.id}</span>
    ),
  },
  {
    key: "vendorName",
    label: "Vendor",
    sortable: true,
    render: (row: Invoice) => (
      <span className="font-mono text-black font-medium">{row.vendorName}</span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    className: "text-right",
    render: (row: Invoice) => (
      <MoneyDisplay amount={row.amount} token={row.token} className="text-black font-mono font-bold" />
    ),
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
    render: (row: Invoice) => (
      <span className="font-mono text-black/60 text-[12px]">{formatDate(row.dueDate)}</span>
    ),
  },
  {
    key: "token",
    label: "Token",
    render: (row: Invoice) => (
      <span className="font-mono text-black/50 text-[12px] uppercase">{row.token}</span>
    ),
  },
];

function SubmitButton({ invoice, onSubmitted }: { invoice: Invoice; onSubmitted: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    // Require wallet connection
    const { connected } = useWalletStore.getState();
    if (!connected) {
      toast.error("Connect your wallet first to submit invoices.");
      return;
    }

    setLoading(true);
    try {
      // On-chain submit requires InvoiceRecord from wallet — not available without record scanning. DB-only for now.
      const rawId = (invoice as unknown as { _raw?: { id: string } })._raw?.id;
      if (!rawId) return;
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rawId, status: "pending" }),
      });
      if (res.ok) {
        toast.success("Invoice submitted for approval");
        onSubmitted();
      }
    } catch {
      toast.error("Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  if (invoice.status !== "draft") return null;

  return (
    <button
      onClick={handleSubmit}
      disabled={loading}
      className="bg-[#C6F15C] text-black border-2 border-black font-mono text-[10px] font-bold uppercase px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
    >
      {loading ? "..." : "Submit"}
    </button>
  );
}

export default function PayablesPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [entryMode, setEntryMode] = useState<"upload" | "manual">("upload");
  const [extractedData, setExtractedData] = useState<InvoiceExtraction | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    vendor_name: "",
    invoice_number: "",
    amount: "",
    tax_amount: "",
    currency: "ALEO" as string,
    issue_date: "",
    due_date: "",
    po_number: "",
    notes: "",
  });

  function resetManualForm() {
    setManualForm({
      vendor_name: "",
      invoice_number: "",
      amount: "",
      tax_amount: "",
      currency: "ALEO",
      issue_date: "",
      due_date: "",
      po_number: "",
      notes: "",
    });
  }

  function handleManualSave() {
    // Construct extractedData from manual form fields
    const data: InvoiceExtraction = {
      vendor_name: manualForm.vendor_name || null,
      invoice_number: manualForm.invoice_number || null,
      amount: parseFloat(manualForm.amount) || 0,
      tax_amount: parseFloat(manualForm.tax_amount) || 0,
      due_date: manualForm.due_date || null,
      issue_date: manualForm.issue_date || null,
      line_items: [],
      po_number: manualForm.po_number || null,
      currency: manualForm.currency || "ALEO",
      confidence: {},
    };
    setExtractedData(data);
  }

  const { data: invoices, loading, isReal, refresh: refreshInvoices } = useData<Invoice[]>("/api/invoices", mockInvoices);

  const handleFileSelected = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }
      const json = await res.json();
      setExtractedData(json.data);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!extractedData) return;

    // Step 1: Require wallet connection
    const { connected, address } = useWalletStore.getState();
    if (!connected || !address) {
      toast.error("Connect your wallet first to save invoices.");
      return;
    }

    setSaving(true);
    try {
      const amountMicro = Math.round((extractedData.amount ?? 0) * 1_000_000);
      const taxMicro = Math.round((extractedData.tax_amount ?? 0) * 1_000_000);

      // Step 2: On-chain FIRST — wallet must sign before DB save
      const nonce = generateNonce();
      const companyHash = await hashToField(address);
      const vendorHash = await hashToField(extractedData.vendor_name ?? "unknown");
      const dueDateTs = extractedData.due_date
        ? Math.floor(new Date(extractedData.due_date).getTime() / 1000)
        : nowTimestamp();

      const txResult = await createInvoiceOnChain({
        companyHash,
        vendorHash,
        vendorAddress: "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc",
        amount: BigInt(amountMicro),
        taxAmount: BigInt(taxMicro),
        currencyFlag: 0,
        dueDate: dueDateTs,
        createdAt: nowTimestamp(),
        glCodeHash: "0",
        poHash: "0",
        itemsHash: "0",
        memoHash: "0",
        nonce,
        categoryHash: "0",
      });

      if (txResult.status === "failed") {
        toast.error(txResult.error || "On-chain invoice creation failed");
        return;
      }

      // Step 3: On-chain succeeded — NOW save to DB with TX ID
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: extractedData.invoice_number,
          amount_micro: amountMicro,
          tax_amount_micro: taxMicro,
          total_amount_micro: amountMicro + taxMicro,
          currency: extractedData.currency || "USD",
          issue_date: extractedData.issue_date,
          due_date: extractedData.due_date,
          line_items: extractedData.line_items,
          po_number: extractedData.po_number,
          extracted_data: extractedData,
          confidence_score: extractedData.confidence
            ? Object.values(extractedData.confidence).reduce((a, b) => a + b, 0) /
              Object.values(extractedData.confidence).length
            : null,
          aleo_tx_id: txResult.transactionId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save invoice");
      }

      toastSuccess(
        "Invoice committed on-chain",
        txResult.transactionId ? `TX: ${txResult.transactionId.slice(0, 16)}...` : undefined
      );

      refreshInvoices();
      setShowCreate(false);
      setExtractedData(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }, [extractedData, refreshInvoices]);

  const handleClosePanel = useCallback(() => {
    setShowCreate(false);
    setExtractedData(null);
    setExtractError(null);
    setEntryMode("upload");
    resetManualForm();
  }, []);

  const counts: Record<FilterKey, number> = useMemo(
    () => ({
      all: invoices.length,
      pending: invoices.filter((i) => i.status === "pending").length,
      approved: invoices.filter((i) => i.status === "approved").length,
      paid: invoices.filter((i) => i.status === "paid" || i.status === "settled").length,
    }),
    [invoices]
  );

  const filtered = useMemo(() => {
    let result = invoices.filter((i) => matchesFilter(i, activeFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.vendorName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [invoices, activeFilter, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1100px]"
    >
      <PageHeader
        title="Payables"
        action={
          <button
            className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Payable
          </button>
        }
      />

      {/* AI Upload zone */}
      <div className="mb-5 bg-black text-[#C6F15C] border-2 border-black p-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#C6F15C] flex items-center justify-center flex-shrink-0">
            <Upload size={18} className="text-[#C6F15C]" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-mono font-bold uppercase tracking-wider">
              Drop a PDF &mdash; AI extracts vendor, amounts, line items
            </p>
            <p className="text-[11px] text-[#C6F15C]/70 font-mono mt-0.5">
              Supports invoices, receipts, and purchase orders
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-1 border-2 border-[#C6F15C] text-[11px] font-mono font-bold uppercase tracking-wider">
            <Sparkles size={10} strokeWidth={2} />
            AI-powered
          </span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-0">
          {filterKeys.map((key) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-3 py-1.5 border-2 border-black text-[12px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer -ml-[2px] first:ml-0 ${
                activeFilter === key
                  ? "bg-[#C6F15C] text-black"
                  : "bg-white text-black/60 hover:bg-[#E5E5E5]"
              }`}
            >
              {filterLabel(key, counts[key])}
            </button>
          ))}
          {isReal && (
            <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5 ml-2">
              Live
            </span>
          )}
        </div>

        <div className="relative">
          <Search size={13} strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 h-8 pl-8 pr-3 border-2 border-black bg-white text-[12px] text-black font-mono placeholder:text-black/30 focus:outline-none focus:ring-0 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
          />
        </div>
      </div>

      {/* Data table or empty state */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : filtered.length === 0 ? (
        <p className="py-12 font-mono text-[13px] text-black/40 text-center uppercase">No invoices found</p>
      ) : (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden">
          <DataTable
            columns={[
              ...invoiceColumns,
              {
                key: "actions",
                label: "",
                render: (row: Invoice) => <SubmitButton invoice={row} onSubmitted={refreshInvoices} />,
              },
            ]}
            data={filtered}
            getRowKey={(row: Invoice) => row.id}
          />
        </div>
      )}

      {/* Invoice creation slide panel */}
      <SlidePanel open={showCreate} onClose={handleClosePanel} title="New Payable">
        {!extractedData ? (
          <div className="space-y-4">
            {/* Mode toggle tabs */}
            <div className="flex gap-0">
              <button
                onClick={() => setEntryMode("upload")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-black font-mono text-[11px] font-bold uppercase tracking-wider transition-all ${
                  entryMode === "upload"
                    ? "bg-[#C6F15C] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-white text-black/50 hover:bg-[#E5E5E5]"
                }`}
              >
                <Upload className="w-3 h-3" />
                AI Upload
              </button>
              <button
                onClick={() => setEntryMode("manual")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-black -ml-[2px] font-mono text-[11px] font-bold uppercase tracking-wider transition-all ${
                  entryMode === "manual"
                    ? "bg-[#A259FF] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-white text-black/50 hover:bg-[#E5E5E5]"
                }`}
              >
                <PenLine className="w-3 h-3" />
                Manual Entry
              </button>
            </div>

            {entryMode === "upload" ? (
              <>
                <p className="text-[13px] font-mono text-black/70">
                  Upload an invoice PDF or image. AI will extract vendor, amounts, and line items automatically.
                </p>
                <FileUploadZone onFileSelected={handleFileSelected} loading={extracting} />
                {extractError && (
                  <p className="text-xs font-mono text-red-600 font-bold">{extractError}</p>
                )}
              </>
            ) : (
              /* Manual entry form */
              <div className="space-y-3">
                <p className="text-[13px] font-mono text-black/70">
                  Enter invoice details manually. All fields with * are required.
                </p>
                <Input
                  label="Vendor Name *"
                  placeholder="Acme Corp"
                  value={manualForm.vendor_name}
                  onChange={(e) => setManualForm((f) => ({ ...f, vendor_name: e.target.value }))}
                />
                <Input
                  label="Invoice Number *"
                  placeholder="INV-001"
                  value={manualForm.invoice_number}
                  onChange={(e) => setManualForm((f) => ({ ...f, invoice_number: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Amount *"
                    type="number"
                    placeholder="0.00"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                  <Input
                    label="Tax"
                    type="number"
                    placeholder="0.00"
                    value={manualForm.tax_amount}
                    onChange={(e) => setManualForm((f) => ({ ...f, tax_amount: e.target.value }))}
                  />
                </div>

                {/* Currency select */}
                <div className="space-y-1.5">
                  <label className="block font-mono text-xs font-bold uppercase tracking-wider text-text-3">
                    Currency
                  </label>
                  <select
                    value={manualForm.currency}
                    onChange={(e) => setManualForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full border-2 border-black bg-white font-mono text-sm p-3 text-text-1 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all appearance-none cursor-pointer"
                  >
                    <option value="ALEO">ALEO</option>
                    <option value="USDCx">USDCx</option>
                    <option value="USAD">USAD</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Issue Date"
                    type="date"
                    value={manualForm.issue_date}
                    onChange={(e) => setManualForm((f) => ({ ...f, issue_date: e.target.value }))}
                  />
                  <Input
                    label="Due Date"
                    type="date"
                    value={manualForm.due_date}
                    onChange={(e) => setManualForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
                <Input
                  label="PO Number"
                  placeholder="PO-12345 (optional)"
                  value={manualForm.po_number}
                  onChange={(e) => setManualForm((f) => ({ ...f, po_number: e.target.value }))}
                />
                <Input
                  label="Notes"
                  placeholder="Additional notes (optional)"
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                />

                <button
                  onClick={handleManualSave}
                  disabled={!manualForm.vendor_name || !manualForm.invoice_number || !manualForm.amount}
                  className="w-full bg-[#A259FF] text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2.5 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Review & Save
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <p className="text-[13px] font-mono font-bold text-green-700 uppercase">
                {entryMode === "manual" ? "Review invoice details" : "Data extracted successfully"}
              </p>
            </div>
            <Input
              label="Vendor Name"
              value={extractedData.vendor_name ?? ""}
              onChange={(e) =>
                setExtractedData({ ...extractedData, vendor_name: e.target.value })
              }
            />
            <Input
              label="Invoice Number"
              value={extractedData.invoice_number ?? ""}
              onChange={(e) =>
                setExtractedData({ ...extractedData, invoice_number: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount"
                type="number"
                value={extractedData.amount?.toString() ?? ""}
                onChange={(e) =>
                  setExtractedData({ ...extractedData, amount: parseFloat(e.target.value) || 0 })
                }
              />
              <Input
                label="Tax"
                type="number"
                value={extractedData.tax_amount?.toString() ?? ""}
                onChange={(e) =>
                  setExtractedData({ ...extractedData, tax_amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Issue Date"
                type="date"
                value={extractedData.issue_date ?? ""}
                onChange={(e) =>
                  setExtractedData({ ...extractedData, issue_date: e.target.value })
                }
              />
              <Input
                label="Due Date"
                type="date"
                value={extractedData.due_date ?? ""}
                onChange={(e) =>
                  setExtractedData({ ...extractedData, due_date: e.target.value })
                }
              />
            </div>
            <Input
              label="PO Number"
              value={extractedData.po_number ?? ""}
              onChange={(e) =>
                setExtractedData({ ...extractedData, po_number: e.target.value })
              }
            />
            <Input
              label="Currency"
              value={extractedData.currency ?? ""}
              onChange={(e) =>
                setExtractedData({ ...extractedData, currency: e.target.value })
              }
            />

            {/* Confidence scores */}
            {extractedData.confidence && (
              <div className="border-2 border-black bg-[#F5F5F4] p-3">
                <p className="font-mono text-[11px] uppercase tracking-wider font-bold text-black mb-2">
                  AI Confidence
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(extractedData.confidence).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-black/60">{key.replace(/_/g, " ")}</span>
                      <span
                        className={`text-[11px] font-mono font-bold ${
                          val >= 0.9 ? "text-green-700" : val >= 0.7 ? "text-yellow-700" : "text-red-600"
                        }`}
                      >
                        {(val * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 bg-white text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                onClick={() => {
                  setExtractedData(null);
                  setExtractError(null);
                }}
              >
                {entryMode === "manual" ? "Back" : "Re-upload"}
              </button>
              <button
                className="flex-1 bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Invoice"}
              </button>
            </div>
          </div>
        )}
      </SlidePanel>
    </motion.div>
  );
}
