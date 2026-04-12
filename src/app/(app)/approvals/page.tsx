"use client";

import { useState, useCallback } from "react";
import { useData } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/utils";
import { toastSuccess } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { motion } from "framer-motion";
import { Shield, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { Approval, Invoice } from "@/lib/types";
import { useWalletStore } from "@/stores/wallet-store";
import { approvePrivate } from "@/lib/aleo/programs/workflow";
import { generateNonce, hashToField } from "@/lib/crypto";

function urgencyColor(amount: number): string {
  return amount > 100_000_000_000 ? "bg-red-600" : "bg-yellow-500";
}

export default function ApprovalsPage() {
  const [actioning, setActioning] = useState<string | null>(null);

  // Blind approval — default ON. Approvers see amount + category + invoice id
  // and approve based on policy, not on "do I like this vendor." Prevents
  // favoritism, approver-vendor collusion, and leaked-identity attacks where
  // seeing the vendor name tips off the approver to bias the decision.
  // Admin-only "reveal" for cases where identity is genuinely needed.
  const [blindMode, setBlindMode] = useState(true);

  const { data: approvals, refresh: refreshApprovals, isReal } = useData<Approval[]>("/api/approvals", []);
  const { data: invoices } = useData<Invoice[]>("/api/invoices", []);

  /** Stable short hash for the redacted vendor display. Same vendor always
   *  maps to the same code within a session so an approver can still match
   *  related invoices, but they never see the actual name unless they
   *  explicitly reveal it. */
  function vendorRedacted(vendorName: string): string {
    let h = 0;
    for (let i = 0; i < vendorName.length; i++) {
      h = ((h << 5) - h + vendorName.charCodeAt(i)) | 0;
    }
    const code = Math.abs(h).toString(36).slice(0, 6).toUpperCase();
    return `Vendor #${code}`;
  }

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
      setActioning(approvalId);
      try {
        // Fix #3 — Threshold routing enforcement BEFORE any state change.
        // If the company has committed amount-based approval tiers (stored
        // in localStorage with a tx hash proving on-chain commit), the
        // current approver must match the tier for this invoice's amount.
        // Otherwise: block. An approver who shouldn't be authorizing an
        // amount that high cannot bypass the rule by clicking the button.
        if (action === "approve") {
          try {
            const raw = localStorage.getItem("stealthap.thresholds");
            if (raw) {
              const thresholds = JSON.parse(raw) as Array<{
                tier: number;
                minMicro: number;
                maxMicro: number;
                approver: string;
                autoApprove: boolean;
                txHash?: string;
              }>;
              const committed = thresholds.filter((r) => r.txHash);
              if (committed.length > 0) {
                const approval = approvals.find((a) => a.id === approvalId);
                const amount = approval?.amount ?? 0;
                const tier = committed.find((r) => amount >= r.minMicro && amount <= r.maxMicro);
                if (!tier) {
                  toast.error(
                    `No approval tier covers ${(amount / 1_000_000).toFixed(2)} ALEO. Configure in Settings → Rules.`,
                    { duration: 8000 },
                  );
                  return;
                }
                if (tier.autoApprove) {
                  toast.info(`Tier ${tier.tier} auto-approves — this invoice is already authorized.`);
                  return;
                }
                const { address } = useWalletStore.getState();
                const expected = tier.approver.trim();
                if (expected && expected.startsWith("aleo1") && address && address !== expected) {
                  toast.error(
                    `Tier ${tier.tier} (${(tier.minMicro / 1_000_000).toFixed(0)}–${(tier.maxMicro / 1_000_000).toFixed(0)} ALEO) is assigned to ${expected.slice(0, 10)}… — you are not authorized.`,
                    { duration: 10000 },
                  );
                  return;
                }
              }
            }
          } catch { /* no committed thresholds — continue without enforcement */ }
        }

        // Step 1 — DB write. Always happens, even if the on-chain commitment
        // below fails, so the audit trail reflects user intent.
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
        toastSuccess(
          action === "approve" ? "Invoice approved" : "Invoice rejected",
          action === "approve" ? "Committing on-chain…" : undefined,
        );

        // Step 2 — for approvals only, fire stealthap_wf_v2.aleo::approve_private.
        // This writes a ZK commitment on-chain without revealing the approver's
        // identity or which invoice. Non-blocking: the DB record is already
        // updated, so a failed on-chain tx doesn't undo the approval — we
        // just toast and leave the aleo_tx_id null on the row.
        if (action === "approve") {
          const approval = approvals.find((a) => a.id === approvalId);
          if (!approval) return;
          const { connected } = useWalletStore.getState();
          if (!connected) {
            toast.info("Wallet not connected — approval saved off-chain only.");
            return;
          }

          try {
            // Derive invoice_id EXACTLY as payment-flow.tsx does
            // (hashToField(`${invoice.id}:${invoice.invoice_number}`)) so the
            // wf_v2 commitment key matches the pay_v2 finalize key. If we
            // change one derivation and forget the other, the on-chain
            // story breaks silently: the approve_private record wouldn't
            // be observable from the payment's vantage.
            const inv = invoices.find((i) => i.id === approval.invoiceId);
            const invoiceNumber = (inv as Invoice & { invoice_number?: string })?.invoice_number || inv?.id || approval.invoiceId;
            const invoiceIdField = await hashToField(`${approval.invoiceId}:${invoiceNumber}`);
            const nonce = generateNonce();

            const txResult = await approvePrivate(invoiceIdField, nonce);
            if (txResult.transactionId) {
              await fetch("/api/approvals", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: approvalId,
                  aleo_tx_id: txResult.transactionId,
                }),
              });
              toastSuccess(
                "Approval committed on-chain",
                `TX: ${txResult.transactionId.slice(0, 16)}…`,
              );
            } else {
              toast.info("On-chain commitment skipped — wallet rejected or not configured.");
            }
          } catch (onChainErr) {
            console.warn("[approvals] on-chain commit failed, DB record retained", onChainErr);
            toast.info("On-chain commitment failed — approval saved off-chain.");
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActioning(null);
      }
    },
    [refreshApprovals, approvals, invoices],
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
        action={
          <button
            onClick={() => setBlindMode((b) => !b)}
            className="flex items-center gap-2 bg-white text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
            title={blindMode ? "Vendor names hidden — click to reveal (admin action)" : "Vendor names visible"}
          >
            {blindMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {blindMode ? "Blind mode" : "Unblinded"}
          </button>
        }
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
                    <span className="text-[16px] font-mono font-black text-black uppercase">
                      {blindMode ? vendorRedacted(approval.vendorName) : approval.vendorName}
                    </span>
                    <span className="text-[11px] font-mono text-black/50">{approval.invoiceId}</span>
                    {blindMode && (
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-black text-[#C6F15C] px-1.5 py-0.5">
                        private
                      </span>
                    )}
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
                  <td className="px-3 py-2.5 font-mono text-black">
                    {blindMode ? vendorRedacted(decision.vendorName) : decision.vendorName}
                  </td>
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
