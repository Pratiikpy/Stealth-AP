"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Shield, FileCheck, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/lib/hooks/use-data";
import { useWalletStore } from "@/stores/wallet-store";
import { generateAuditProof } from "@/lib/aleo/programs/audit";
import { generateNonce, hashToField } from "@/lib/crypto";
import { toastSuccess, toastError } from "@/lib/utils";
import { toast } from "sonner";
import type { Invoice } from "@/lib/types";

interface AuditProof {
  id?: string;
  proof_id?: string;
  date?: string;
  created_at?: string;
  scope?: string[];
  disclosure_fields?: string[];
  status: "verified" | "expired" | string;
}

const MOCK_PROOFS: AuditProof[] = [
  { proof_id: "proof_0x8f3a2c...7d4e", date: "Apr 6, 2026", scope: ["Amount", "Vendor", "Category"], status: "verified" },
  { proof_id: "proof_0xb94f2e...a3d8", date: "Mar 15, 2026", scope: ["Amount", "Due Date"], status: "verified" },
  { proof_id: "proof_0x2c91bf...e8a0", date: "Feb 28, 2026", scope: ["Amount", "Vendor", "Category", "Due Date"], status: "expired" },
];

const DISCLOSURE_OPTIONS = ["Amount", "Vendor", "Category", "Due Date"];

export default function AuditPage() {
  const [selected, setSelected] = useState<string[]>(["Amount", "Vendor"]);
  const [generating, setGenerating] = useState(false);
  const [dateStart, setDateStart] = useState("2026-01-01");
  const [dateEnd, setDateEnd] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: proofs, refresh: refreshProofs, isReal } = useData<AuditProof[]>("/api/audit", MOCK_PROOFS);
  const { data: allInvoices } = useData<Invoice[]>("/api/invoices", []);
  const { connected, address } = useWalletStore();

  // Compute real totals from invoices within the selected date range
  // Fix #6 — Audit proof integrity. Previously this counted every DB invoice
  // in the date range, so a user could fabricate invoices locally and
  // generate a "proof" of audited totals that never hit the chain. The audit
  // is only meaningful for invoices that carry an on-chain tx hash
  // (aleo_tx_id / txHash) proving they were committed. We filter those out
  // here and expose the attested count so the UI can surface the integrity
  // gap to the user before they generate a proof.
  const { realTotal, realCount, unattestedCount } = useMemo(() => {
    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    endDate.setHours(23, 59, 59, 999);
    const inRange = allInvoices.filter((inv) => {
      const created = new Date(inv.createdAt);
      return created >= startDate && created <= endDate;
    });
    const onChain = inRange.filter((inv) => {
      const v = inv as Invoice & { txHash?: string | null; aleo_tx_id?: string | null };
      return !!(v.txHash || v.aleo_tx_id);
    });
    return {
      realTotal: onChain.reduce((sum, inv) => sum + inv.amount, 0),
      realCount: onChain.length,
      unattestedCount: inRange.length - onChain.length,
    };
  }, [allInvoices, dateStart, dateEnd]);

  function toggleField(field: string) {
    setSelected((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleGenerate() {
    // Step 1: Require wallet connection
    if (!connected || !address) {
      toast.error("Connect your wallet first to generate audit proofs.");
      return;
    }

    // Integrity guard — refuse to generate a proof over zero on-chain data.
    // Without this, a user could generate an "audit proof" for 0 invoices
    // and the contract would accept it. We require at least one invoice
    // with a real on-chain commitment in the date range.
    if (realCount === 0) {
      toast.error(
        unattestedCount > 0
          ? `${unattestedCount} invoice(s) in range but none have on-chain commitments. Create invoices on-chain first.`
          : "No invoices found in this date range.",
        { duration: 10000 },
      );
      return;
    }

    setGenerating(true);
    try {
      // Step 2: On-chain FIRST
      const nonce = generateNonce();
      const dateStartTs = Math.floor(new Date(dateStart).getTime() / 1000);
      const dateEndTs = Math.floor(new Date(dateEnd).getTime() / 1000);

      const companyHash = await hashToField(address);

      const result = await generateAuditProof({
        companyHash,
        dateStart: dateStartTs,
        dateEnd: dateEndTs,
        totalAmount: BigInt(realTotal),
        invoiceCount: BigInt(realCount),
        nonce,
      });

      if (result.status === "failed") {
        toastError("ZK proof generation failed", result.error ?? "Unknown error");
        return;
      }

      const aleoTxId = result.transactionId;
      toastSuccess("ZK proof generated on-chain", aleoTxId ? `TX: ${aleoTxId.slice(0, 16)}...` : undefined);

      // Step 3: On-chain succeeded — NOW save to DB
      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proof_type: "selective_disclosure",
            date_range_start: dateStart,
            date_range_end: dateEnd,
            disclosure_fields: selected,
            aleo_tx_id: aleoTxId,
          }),
        });
        if (res.ok) {
          refreshProofs();
        }
      } catch {
        // API unavailable — on-chain proof exists, DB save failed silently
      }
    } catch (err) {
      toastError("Aleo transaction failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function proofLabel(p: AuditProof): string {
    return p.proof_id ?? p.id ?? "—";
  }

  function proofDate(p: AuditProof): string {
    return p.date ?? p.created_at ?? "—";
  }

  function proofScope(p: AuditProof): string[] {
    return p.scope ?? p.disclosure_fields ?? [];
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader title="Compliance & Audit" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Generate Proof */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-black bg-[#B3A0FF] flex items-center gap-2">
            <Shield size={14} className="text-black" />
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Generate Proof</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="font-mono text-[11px] font-bold text-black uppercase tracking-wider block mb-2">
                Date range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-black bg-white text-[12px] font-mono text-black focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none transition-all"
                />
                <span className="flex items-center font-mono text-black/40 text-[12px] uppercase font-bold">to</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-black bg-white text-[12px] font-mono text-black focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[11px] font-bold text-black uppercase tracking-wider block mb-2">
                Selective disclosure
              </label>
              <div className="space-y-2">
                {DISCLOSURE_OPTIONS.map((field) => {
                  const checked = selected.includes(field);
                  return (
                    <label
                      key={field}
                      className="flex items-center gap-2.5 cursor-pointer group"
                      onClick={() => toggleField(field)}
                    >
                      <div
                        className={`w-5 h-5 border-2 border-black flex items-center justify-center transition-colors ${
                          checked
                            ? "bg-[#C6F15C]"
                            : "bg-white group-hover:bg-[#E5E5E5]"
                        }`}
                      >
                        {checked && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="#000000"
                              strokeWidth="2"
                              strokeLinecap="square"
                              strokeLinejoin="miter"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-[13px] font-mono text-black group-hover:text-black/70 transition-colors">
                        {field}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Integrity panel — audit proof is ONLY generated over invoices
                with on-chain commitments. DB-only invoices are surfaced as
                unattested so the auditor knows what's NOT covered by the proof. */}
            <div className="border-2 border-black bg-white p-3 mb-3 font-mono text-[11px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-black/60 uppercase tracking-wider">
                  On-chain invoices in range
                </span>
                <span className="text-black font-bold tabular-nums">{realCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-black/60 uppercase tracking-wider">
                  Attested total (ALEO)
                </span>
                <span className="text-black font-bold tabular-nums">
                  {(realTotal / 1_000_000).toFixed(2)}
                </span>
              </div>
              {unattestedCount > 0 && (
                <div className="flex items-center justify-between border-t-2 border-black/10 pt-1 mt-1">
                  <span className="text-[#EF4444] uppercase tracking-wider font-bold">
                    Unattested (DB only, excluded)
                  </span>
                  <span className="text-[#EF4444] font-bold tabular-nums">{unattestedCount}</span>
                </div>
              )}
            </div>

            <button
              className="w-full bg-black text-[#C6F15C] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-3 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={generating || selected.length === 0 || realCount === 0}
              onClick={handleGenerate}
            >
              <Shield className="w-3.5 h-3.5" />
              {generating ? "Generating..." : "Generate ZK Proof"}
            </button>
          </div>
        </div>

        {/* Proof History */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          <div className="px-4 py-3 border-b-2 border-black bg-[#C6F15C] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck size={14} className="text-black" />
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Proof History</span>
            </div>
            {isReal && (
              <span className="bg-white border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
                Live
              </span>
            )}
          </div>
          <div>
            {proofs.map((p, idx) => (
              <div key={p.proof_id ?? p.id ?? idx} className="px-4 py-3 border-b-2 border-black last:border-0">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-[12px] font-mono text-black font-bold">{proofLabel(p)}</span>
                  <span
                    className={`border-2 border-black px-2 py-0.5 text-[11px] font-mono font-bold uppercase ${
                      p.status === "verified"
                        ? "bg-[#C6F15C] text-black"
                        : "bg-yellow-300 text-black"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-black/50">
                  <Clock size={11} />
                  {proofDate(p)}
                </div>
                {proofScope(p).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {proofScope(p).map((s) => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 border-2 border-black bg-[#E5E5E5] font-mono text-black font-bold uppercase">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {proofs.length === 0 && (
              <p className="px-4 py-8 text-[12px] font-mono text-black/40 text-center uppercase">No proofs generated yet</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
