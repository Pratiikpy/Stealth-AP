"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, Lock, ExternalLink, FileCheck, Fingerprint, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/lib/hooks/use-data";
import { useWalletStore } from "@/stores/wallet-store";
import { truncateAddress, explorerTxUrl } from "@/lib/format";
import { formatDate, formatMicro } from "@/lib/utils";

/**
 * Privacy dashboard — real-data reflection of the user's on-chain posture.
 *
 * Previously this page was an illustration with hardcoded mock values,
 * which was an own-goal for a privacy-focused product: the one page that
 * should *prove* the privacy claim was showing fictional numbers. Now it
 * pulls from /api/invoices, /api/approvals, /api/audit and summarizes the
 * user's actual commitments with live explorer links.
 */

type InvoiceWithTrail = {
  id: string;
  vendorName?: string;
  invoice_number?: string;
  amount?: number;
  txHash?: string;
  invoice_hash?: string | null;
  approvals?: Array<{ aleo_tx_id?: string; status?: string }>;
  createdAt?: string;
};

type PaymentRow = {
  id: string;
  vendorName?: string;
  amount?: number;
  txHash?: string;
  settledAt?: string;
};

type AuditProof = {
  id?: string;
  aleo_tx_id?: string;
  proof_type?: string;
  created_at?: string;
  date_range_start?: string;
  date_range_end?: string;
};

function TxLink({ hash }: { hash?: string | null }) {
  if (!hash) return <span className="text-black/30 italic text-[10px]">not yet committed</span>;
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[10px] text-black underline hover:text-[#A259FF] truncate"
    >
      {hash.slice(0, 18)}…
      <ExternalLink size={10} />
    </a>
  );
}

export default function PrivacyPage() {
  const { address, connected, walletName } = useWalletStore();
  const { data: invoices } = useData<InvoiceWithTrail[]>("/api/invoices", []);
  const { data: payments } = useData<PaymentRow[]>("/api/payments", []);
  const { data: auditProofs } = useData<AuditProof[]>("/api/audit", []);

  const invoicesCommitted = invoices.filter((i) => !!i.txHash).length;
  const approvalsCommitted = invoices.reduce(
    (n, i) => n + (i.approvals?.filter((a) => a.aleo_tx_id).length ?? 0),
    0
  );
  const paymentsSettled = payments.filter((p) => !!p.txHash).length;
  const proofsGenerated = auditProofs.filter((p) => !!p.aleo_tx_id).length;

  const totalOnChainCommitments =
    invoicesCommitted + approvalsCommitted + paymentsSettled + proofsGenerated;

  // Latest ten commitments across invoice/approval/payment/audit
  type Row = { kind: string; hash: string; when: string; label: string };
  const trail: Row[] = [];
  for (const inv of invoices) {
    if (inv.txHash) {
      trail.push({
        kind: "inv_v2",
        hash: inv.txHash,
        when: inv.createdAt || "",
        label: `Invoice ${inv.invoice_number || inv.id.slice(0, 6)} committed`,
      });
    }
    for (const a of inv.approvals ?? []) {
      if (a.aleo_tx_id) {
        trail.push({
          kind: "wf_v2",
          hash: a.aleo_tx_id,
          when: inv.createdAt || "",
          label: `Approval for ${inv.invoice_number || inv.id.slice(0, 6)}`,
        });
      }
    }
  }
  for (const p of payments) {
    if (p.txHash) {
      trail.push({
        kind: "pay_v2",
        hash: p.txHash,
        when: p.settledAt || "",
        label: `Payment settled (${formatMicro(p.amount ?? 0)} ALEO)`,
      });
    }
  }
  for (const pf of auditProofs) {
    if (pf.aleo_tx_id) {
      trail.push({
        kind: "aud_v2",
        hash: pf.aleo_tx_id,
        when: pf.created_at || "",
        label: `Audit proof (${pf.proof_type || "disclosure"})`,
      });
    }
  }
  trail.sort((a, b) => (a.when > b.when ? -1 : 1));
  const recentTrail = trail.slice(0, 10);

  const statCards = [
    {
      label: "Invoices on-chain",
      value: invoicesCommitted.toString(),
      sub: `${invoices.length} total in system`,
      icon: FileCheck,
      bg: "bg-[#C6F15C]",
    },
    {
      label: "Approvals committed",
      value: approvalsCommitted.toString(),
      sub: "zk-private on wf_v2",
      icon: Shield,
      bg: "bg-[#B3A0FF]",
    },
    {
      label: "Payments settled",
      value: paymentsSettled.toString(),
      sub: "zk-private on pay_v2",
      icon: Lock,
      bg: "bg-[#FF90E8]",
    },
    {
      label: "Audit proofs",
      value: proofsGenerated.toString(),
      sub: "selective disclosure",
      icon: Fingerprint,
      bg: "bg-white",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Privacy Posture"
        description="Your live privacy footprint on Aleo. Hashes are public; everything else stays in encrypted records."
      />

      {/* Wallet identity card */}
      <div className="mb-6 bg-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border-2 border-[#C6F15C] bg-[#C6F15C]/10 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-[#C6F15C]" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider font-bold text-[#C6F15C]/70">
              Connected wallet ({walletName || "none"})
            </p>
            <p className="font-mono text-[12px] font-bold text-white break-all">
              {connected && address ? truncateAddress(address, 10) : "not connected"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[10px] uppercase tracking-wider font-bold text-white/60">
              Total commitments
            </p>
            <p className="font-mono text-[20px] font-black text-[#C6F15C] tabular-nums">
              {totalOnChainCommitments}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((c) => (
          <div
            key={c.label}
            className={`${c.bg} border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-black/60">
                {c.label}
              </span>
              <c.icon className="w-4 h-4 text-black" />
            </div>
            <p className="text-[28px] font-mono font-black leading-[1] tracking-tight text-black tabular-nums">
              {c.value}
            </p>
            <p className="font-mono text-[10px] text-black/50 mt-1 uppercase tracking-wider">
              {c.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Recent trail */}
      <div className="flex items-center gap-2 mb-3">
        <Layers size={16} className="text-black" />
        <h2 className="font-mono text-xl font-black uppercase tracking-wider text-black">
          Recent on-chain commitments
        </h2>
      </div>
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-8 divide-y-2 divide-black/10">
        {recentTrail.length === 0 ? (
          <p className="py-8 font-mono text-[13px] text-black/40 text-center uppercase">
            No commitments yet. Create or approve an invoice to start.
          </p>
        ) : (
          recentTrail.map((r, idx) => (
            <div key={r.hash + idx} className="flex items-center gap-3 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider font-bold bg-black text-[#C6F15C] px-2 py-0.5 shrink-0">
                {r.kind}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[12px] font-bold text-black truncate">
                  {r.label}
                </p>
                <TxLink hash={r.hash} />
              </div>
              <span className="font-mono text-[10px] text-black/40 shrink-0">
                {r.when ? formatDate(r.when) : ""}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Split view: private vs public */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* PRIVATE to you */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="px-4 py-3 border-b-2 border-black bg-[#C6F15C] flex items-center gap-2">
            <EyeOff size={14} className="text-black" />
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">
              Private to you
            </span>
          </div>
          <ul className="px-4 py-3 space-y-2 font-mono text-[12px] text-black">
            <li>• Vendor names + payment addresses (encrypted records)</li>
            <li>• Invoice line items, memos, notes</li>
            <li>• GL codes, PO numbers, tax details</li>
            <li>• Approval chain identities (zk-private via wf_v2)</li>
            <li>• Payment amounts in transit (pay_v2 finalize sees only payment_id)</li>
            <li>• Internal spending policies (thresholds, spending limits)</li>
            <li>• Audit reports beyond what you explicitly disclose</li>
          </ul>
        </div>

        {/* PUBLIC on Aleo */}
        <div className="bg-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="px-4 py-3 border-b-2 border-white/20 flex items-center gap-2">
            <Eye size={14} className="text-[#C6F15C]" />
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-white">
              Public on Aleo (hashes only)
            </span>
          </div>
          <ul className="px-4 py-3 space-y-2 font-mono text-[12px] text-white/80">
            <li>• invoice_id (deterministic BHP256 hash, per invoice)</li>
            <li>• commitment_root (dual-record creation proof)</li>
            <li>• approval_commitment (wf_v2 mapping key)</li>
            <li>• payment_id = hash(invoice_id, payer, payee, nonce)</li>
            <li>• settlement_anchor (pay_v2 finalize marker)</li>
            <li>• vendor_allowlist_root (if configured)</li>
            <li>• audit_proof_root (selective disclosure)</li>
          </ul>
        </div>
      </div>

      {/* Policy footer */}
      <div className="bg-[#B3A0FF] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4">
        <p className="font-mono text-[12px] font-bold text-black uppercase tracking-wider mb-2">
          Never on-chain, ever
        </p>
        <p className="font-mono text-[11px] text-black/80">
          Vendor identities. Payment amounts. Approver names. Internal memos. Line items. All of it
          stays in encrypted records owned by you. Only cryptographic commitments reach the public
          ledger — and even those use blinding nonces to prevent analysis.
        </p>
      </div>
    </motion.div>
  );
}
