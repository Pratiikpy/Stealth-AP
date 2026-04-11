"use client";

import { useState, useCallback } from "react";
import { approvals as mockApprovals, invoices as mockInvoices } from "@/lib/mock-data";
import { useData } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/utils";
import { toastSuccess } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { motion } from "framer-motion";
import { Shield, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { approvePrivate, rejectInvoiceOnChain } from "@/lib/aleo/programs/workflow";
import { useWalletStore } from "@/stores/wallet-store";
import { generateNonce, nowTimestamp } from "@/lib/crypto";
import type { Approval, Invoice } from "@/lib/types";

function urgencyColor(amount: number): string {
  return amount > 100_000_000_000 ? "bg-red-600" : "bg-yellow-500";
}

export default function ApprovalsPage() {
  const [actioning, setActioning] = useState<string | null>(null);

  const { data: approvals, refresh: refreshApprovals, isReal } = useData<Approval[]>("/api/approvals", mockApprovals);
  const { data: invoices } = useData<Invoice[]>("/api/invoices", mockInvoices);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const recentDecisions = approvals.filter(
    (a) => a.status === "approved" || a.status === "rejected"
  );

  function getApprovalProgress(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { approved: 0, total: 2 };
    const total = Math.max(inv.approvalChain.length, 2);
    const approved = inv.approvalChain.filter((s) => s.status === "approved").length;
    return { approved, total };
  }

  const handleAction = useCallback(
    async (approvalId: string, action: "approve" | "reject") => {
      const { connected } = useWalletStore.getState();

      // Require wallet connection
      if (!connected) {
        toast.error("Connect your wallet first to " + action + " invoices.");
        return;
      }

      setActioning(approvalId);
      try {
        // Step 1: On-chain FIRST — wallet must sign before DB update
        const w = window as unknown as Record<string, unknown>;
        const hasExtension = w.shield || w.leoWallet || w.puzzle || w.foxwallet;

        if (hasExtension) {
          const approval = approvals.find((a) => a.id === approvalId);
          const invoiceId = approval?.invoiceId ?? approvalId;

          if (action === "approve") {
            const nonce = generateNonce();
            const txResult = await approvePrivate(invoiceId, nonce);
            if (txResult.status === "failed") {
              toast.error(txResult.error || "On-chain approval failed");
              setActioning(null);
              return;
            }
            if (txResult.transactionId) {
              toastSuccess("Signed on-chain", `TX: ${txResult.transactionId.slice(0, 16)}...`);
            }
          } else {
            const nonce = generateNonce();
            const txResult = await rejectInvoiceOnChain(invoiceId, nonce, nowTimestamp());
            if (txResult.status === "failed") {
              toast.error(txResult.error || "On-chain rejection failed");
              setActioning(null);
              return;
            }
          }
        }

        // Step 2: Update DB after on-chain succeeds (or if no extension)
        const res = await fetch("/api/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: approvalId, action }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Action failed");
        }

        refreshApprovals();
        toastSuccess(action === "approve" ? "Invoice approved" : "Invoice rejected");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActioning(null);
      }
    },
    [refreshApprovals, approvals]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1100px]"
    >
      <PageHeader
        title="Approvals"
        description="Approval recorded on-chain with privacy"
      />

      {/* Privacy notice */}
      <div className="mb-6 bg-[#B3A0FF] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center flex-shrink-0 mt-0.5">
            <Shield size={16} className="text-black" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[13px] text-black font-mono font-bold uppercase tracking-wider leading-relaxed">
              Your identity is protected by zero-knowledge proofs.
            </p>
            <p className="text-[11px] text-black/60 font-mono mt-0.5">
              Approvals are committed on-chain without revealing who approved.
            </p>
          </div>
        </div>
      </div>

      {/* Pending authorization header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-mono text-xl font-black uppercase tracking-wider text-black">Pending authorization</h2>
        <span className="bg-yellow-400 border-2 border-black text-black font-mono uppercase text-[11px] font-bold px-2 py-0.5">
          {pendingApprovals.length}
        </span>
        {isReal && (
          <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
            Live
          </span>
        )}
      </div>

      {/* Pending approval cards */}
      <div className="space-y-4 mb-8">
        {pendingApprovals.map((approval) => {
          const progress = getApprovalProgress(approval.invoiceId);
          const isLoading = actioning === approval.id;
          return (
            <div key={approval.id} className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5">
              <div className="flex items-start gap-3">
                <span className={`w-3 h-3 border-2 border-black flex-shrink-0 mt-1.5 ${urgencyColor(approval.amount)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[16px] font-mono font-black text-black uppercase">{approval.vendorName}</span>
                    <span className="text-[11px] font-mono text-black/50">{approval.invoiceId}</span>
                  </div>

                  <div className="flex items-baseline gap-3 mb-3">
                    <MoneyDisplay
                      amount={approval.amount}
                      token={approval.token}
                      className="text-[24px] font-mono font-black text-black"
                    />
                    <span className="text-[11px] font-mono text-black/40 uppercase">
                      Requested {formatDate(approval.requestedAt)}
                    </span>
                  </div>

                  {/* Approval progress */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-mono font-bold text-black/60 mr-1 uppercase">
                      {progress.approved} of {progress.total} approved
                    </span>
                    <div className="flex gap-1">
                      {Array.from({ length: progress.total }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`w-5 h-5 border-2 border-black ${
                            idx < progress.approved
                              ? "bg-[#C6F15C]"
                              : "bg-white"
                          } flex items-center justify-center`}
                        >
                          {idx < progress.approved && (
                            <CheckCircle2 size={10} className="text-black" strokeWidth={2.5} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[12px] font-mono text-black/60 mb-3">{approval.description}</p>

                  <div className="flex items-center gap-2">
                    <button
                      className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-1.5 disabled:opacity-50"
                      disabled={isLoading}
                      onClick={() => handleAction(approval.id, "approve")}
                    >
                      <CheckCircle2 size={12} strokeWidth={2.5} />
                      Authorize
                    </button>
                    <button
                      className="bg-[#FF90E8] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-1.5 disabled:opacity-50"
                      disabled={isLoading}
                      onClick={() => handleAction(approval.id, "reject")}
                    >
                      <XCircle size={12} strokeWidth={2} />
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {pendingApprovals.length === 0 && (
          <p className="py-12 font-mono text-[13px] text-black/40 text-center uppercase">All caught up</p>
        )}
      </div>

      {/* Recent decisions */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-mono text-xl font-black uppercase tracking-wider text-black">Recent decisions</h2>
      </div>

      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b-2 border-black bg-[#E5E5E5]">
                {["Invoice", "Vendor", "Amount", "Decision", "By", "When"].map((h) => (
                  <th
                    key={h}
                    className={`font-mono text-[11px] uppercase tracking-wider font-bold text-black px-3 py-2.5 ${
                      h === "Amount" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentDecisions.map((decision) => (
                <tr
                  key={decision.id}
                  className="border-b-2 border-black last:border-0 hover:bg-[#C6F15C]/20 transition-colors"
                >
                  <td className="px-3 py-2.5 font-mono text-black font-bold text-[12px]">{decision.invoiceId}</td>
                  <td className="px-3 py-2.5 font-mono text-black">{decision.vendorName}</td>
                  <td className="px-3 py-2.5 text-right">
                    <MoneyDisplay amount={decision.amount} token={decision.token} className="text-black font-mono" />
                  </td>
                  <td className="px-3 py-2.5"><Badge status={decision.status} /></td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-black/60">{decision.requestedBy}</td>
                  <td className="px-3 py-2.5 text-[12px] font-mono text-black/40">{formatDate(decision.requestedAt)}</td>
                </tr>
              ))}
              {recentDecisions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-[12px] font-mono text-black/40 text-center uppercase">
                    No decisions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
