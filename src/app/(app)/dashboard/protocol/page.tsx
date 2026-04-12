"use client";

/**
 * Protocol Explorer
 *
 * Direct UI surface for every Aleo contract function in the StealthAP stack
 * that isn't already invoked from a primary flow. The main product pages
 * (/payables, /approvals, /settlements, /audit, /dashboard/settings) cover
 * the everyday happy paths; this page covers:
 *
 *   - lifecycle transitions (cancel / mark / submit / deactivate)
 *   - alternate approval paths (delegate / reject / non-private approve)
 *   - advanced payment primitives (escrow, scheduled, pay_verified, join/split)
 *   - batch completion (settle_slot)
 *   - audit variants (selective_disclose, compliance, credit, auditor auth)
 *
 * Each form calls a wrapper from src/lib/aleo/programs/* and surfaces the
 * resulting tx hash with an explorer link. 100% deployed-contract-function
 * coverage from UI — claim "every primitive is reachable" holds literally.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import {
  FileText,
  Users,
  Workflow as WorkflowIcon,
  CreditCard,
  Layers,
  Shield,
  Link2,
  Zap,
} from "lucide-react";
import { toastSuccess, toastError } from "@/lib/utils";
import { useWalletStore } from "@/stores/wallet-store";
import { hashToField, generateNonce, nowTimestamp } from "@/lib/crypto";
import { explorerTxUrl } from "@/lib/format";
import {
  submitInvoiceOnChain,
  markInvoiceApproved,
  markInvoiceRejected,
  markInvoicePaid,
  cancelInvoiceOnChain,
  deactivateVendor,
} from "@/lib/aleo/programs/invoice";
import {
  submitForApproval,
  approveInvoiceOnChain,
  approveVerified,
  rejectInvoiceOnChain,
  delegateApproval,
  checkThresholdMet,
} from "@/lib/aleo/programs/workflow";
import {
  payVerifiedCredits,
  escrowLock,
  escrowRelease,
  escrowRefund,
  schedulePayment,
  executeScheduledPayment,
  verifyPayment,
  joinCredits,
  splitCredits,
} from "@/lib/aleo/programs/payment";
import { settleSlot } from "@/lib/aleo/programs/batch";
import {
  generateVerifiedProof,
  selectiveDisclose,
  setAuditAuthorization,
  revokeAuditAuthorization,
  generateComplianceProof,
  generateCreditProof,
} from "@/lib/aleo/programs/audit";

type TabId = "lifecycle" | "workflow" | "payment" | "batch" | "audit";

const tabs: Array<{ id: TabId; label: string; icon: typeof FileText; bg: string }> = [
  { id: "lifecycle", label: "Lifecycle", icon: FileText, bg: "bg-[#C6F15C]" },
  { id: "workflow", label: "Workflow", icon: WorkflowIcon, bg: "bg-[#FF90E8]" },
  { id: "payment", label: "Payment", icon: CreditCard, bg: "bg-[#B3A0FF]" },
  { id: "batch", label: "Batch", icon: Layers, bg: "bg-black" },
  { id: "audit", label: "Audit", icon: Shield, bg: "bg-white" },
];

type TxRecord = { label: string; hash: string; ts: number };

export default function ProtocolPage() {
  const [activeTab, setActiveTab] = useState<TabId>("lifecycle");
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<TxRecord[]>([]);
  const wallet = useWalletStore();

  async function run<T>(label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) {
    if (!wallet.connected || !wallet.address) {
      toastError("Connect your wallet first");
      return;
    }
    setBusy(label);
    try {
      const res = await fn();
      if (res.status === "failed" || !res.transactionId) {
        toastError(`${label} failed`, res.error ?? "contract returned no tx id");
        return;
      }
      toastSuccess(`${label} committed`, `TX: ${res.transactionId.slice(0, 16)}…`);
      setHistory((h) => [{ label, hash: res.transactionId!, ts: Date.now() }, ...h].slice(0, 20));
    } catch (err) {
      toastError(`${label} threw`, err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Protocol Operations"
        description="Every Aleo contract function in the StealthAP stack, callable from here. Primary flows (create / approve / pay / audit) live in their own pages; this is the advanced surface — lifecycle, escrow, scheduled, auditor auth."
      />

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 border-2 border-black px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-all ${
                active
                  ? `${t.bg} text-${t.bg === "bg-black" ? "[#C6F15C]" : "black"} shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`
                  : "bg-white text-black/60"
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "lifecycle" && <LifecycleTab run={run} busy={busy} />}
      {activeTab === "workflow" && <WorkflowTab run={run} busy={busy} />}
      {activeTab === "payment" && <PaymentTab run={run} busy={busy} />}
      {activeTab === "batch" && <BatchTab run={run} busy={busy} />}
      {activeTab === "audit" && <AuditTab run={run} busy={busy} />}

      {/* Recent ops history */}
      {history.length > 0 && (
        <div className="mt-8 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="px-4 py-3 border-b-2 border-black bg-black">
            <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-[#C6F15C]">
              Session tx history
            </span>
          </div>
          <div className="divide-y-2 divide-black/10">
            {history.map((h, idx) => (
              <div key={`${h.hash}-${idx}`} className="px-4 py-2 flex items-center gap-3 font-mono text-[11px]">
                <span className="text-black/40 w-40 shrink-0">{h.label}</span>
                <a
                  href={explorerTxUrl(h.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-black underline truncate hover:text-[#A259FF]"
                >
                  {h.hash.slice(0, 32)}…
                </a>
                <span className="text-black/30">{new Date(h.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Reusable input components
// ──────────────────────────────────────────────────────────────────────────────

function Section({ title, program, children }: { title: string; program: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4">
      <div className="px-4 py-3 border-b-2 border-black flex items-center justify-between">
        <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">{title}</span>
        <span className="font-mono text-[10px] text-black/60">{program}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase font-bold text-black/60">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-2 border-black bg-white font-mono text-[11px] p-1.5"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase font-bold text-black/60">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-2 border-black bg-white font-mono text-[11px] p-1.5"
      />
    </label>
  );
}

function RunButton({ label, busy, isBusy, onClick }: { label: string; busy: string | null; isBusy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy !== null}
      className="bg-[#C6F15C] text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-3 py-1.5 text-[11px] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-40 transition-all flex items-center gap-1"
    >
      <Zap size={10} />
      {isBusy ? "Signing…" : label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle tab — inv_v2 state transitions + vendor lifecycle
// ──────────────────────────────────────────────────────────────────────────────

function LifecycleTab({ run, busy }: { run: (label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) => Promise<void>; busy: string | null }) {
  const [recordStr, setRecordStr] = useState("");
  const [approverAddr, setApproverAddr] = useState("");
  const [reasonHash, setReasonHash] = useState("0");
  const [settlementAnchor, setSettlementAnchor] = useState("0");

  return (
    <div>
      <Section title="Submit invoice for approval" program="inv_v2::submit_invoice">
        <TextField label="Invoice record plaintext" value={recordStr} onChange={setRecordStr} placeholder="{owner: aleo1…, …}" />
        <RunButton label="Submit" busy={busy} isBusy={busy === "submit_invoice"} onClick={() => run("submit_invoice", () => submitInvoiceOnChain(recordStr))} />
      </Section>

      <Section title="Mark invoice approved" program="inv_v2::mark_approved">
        <TextField label="Invoice record plaintext" value={recordStr} onChange={setRecordStr} />
        <TextField label="Approver address" value={approverAddr} onChange={setApproverAddr} placeholder="aleo1…" />
        <RunButton label="Mark approved" busy={busy} isBusy={busy === "mark_approved"} onClick={() => run("mark_approved", () => markInvoiceApproved(recordStr, approverAddr))} />
      </Section>

      <Section title="Mark invoice rejected" program="inv_v2::mark_rejected">
        <TextField label="Invoice record plaintext" value={recordStr} onChange={setRecordStr} />
        <TextField label="Reason hash (field)" value={reasonHash} onChange={setReasonHash} />
        <RunButton label="Mark rejected" busy={busy} isBusy={busy === "mark_rejected"} onClick={() => run("mark_rejected", () => markInvoiceRejected(recordStr, reasonHash))} />
      </Section>

      <Section title="Mark invoice paid" program="inv_v2::mark_paid">
        <TextField label="Invoice record plaintext" value={recordStr} onChange={setRecordStr} />
        <TextField label="Settlement anchor (field)" value={settlementAnchor} onChange={setSettlementAnchor} />
        <RunButton label="Mark paid" busy={busy} isBusy={busy === "mark_paid"} onClick={() => run("mark_paid", () => markInvoicePaid(recordStr, settlementAnchor))} />
      </Section>

      <Section title="Cancel invoice" program="inv_v2::cancel_invoice">
        <TextField label="Invoice record plaintext" value={recordStr} onChange={setRecordStr} />
        <RunButton label="Cancel" busy={busy} isBusy={busy === "cancel_invoice"} onClick={() => run("cancel_invoice", () => cancelInvoiceOnChain(recordStr))} />
      </Section>

      <Section title="Deactivate vendor" program="inv_v2::deactivate_vendor">
        <TextField label="Vendor record plaintext" value={recordStr} onChange={setRecordStr} />
        <RunButton label="Deactivate vendor" busy={busy} isBusy={busy === "deactivate_vendor"} onClick={() => run("deactivate_vendor", () => deactivateVendor({ vendorRecord: recordStr }))} />
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Workflow tab — wf_v2 approval variants
// ──────────────────────────────────────────────────────────────────────────────

function WorkflowTab({ run, busy }: { run: (label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) => Promise<void>; busy: string | null }) {
  const wallet = useWalletStore();
  const [invoiceIdStr, setInvoiceIdStr] = useState("");
  const [amount, setAmount] = useState("0");
  const [approver, setApprover] = useState("");
  const [requiredApprovals, setRequiredApprovals] = useState("2");
  const [approvalRecord, setApprovalRecord] = useState("");
  const [reasonHash, setReasonHash] = useState("0");
  const [delegateTo, setDelegateTo] = useState("");
  const [invoiceHash, setInvoiceHash] = useState("");

  return (
    <div>
      <Section title="Submit for approval (routed by tier)" program="wf_v2::submit_for_approval">
        <TextField label="Invoice id (field)" value={invoiceIdStr} onChange={setInvoiceIdStr} />
        <TextField label="Approver (aleo1…)" value={approver} onChange={setApprover} />
        <NumberField label="Amount (microcredits)" value={amount} onChange={setAmount} />
        <RunButton
          label="Submit for approval"
          busy={busy}
          isBusy={busy === "submit_for_approval"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("submit_for_approval", () =>
              submitForApproval({
                invoiceId: invoiceIdStr,
                approver,
                companyHash,
                amount: BigInt(amount || "0"),
                createdAt: nowTimestamp(),
                nonce: generateNonce(),
              }),
            );
          }}
        />
      </Section>

      <Section title="Approve (public, non-private variant)" program="wf_v2::approve">
        <TextField label="Approval record plaintext" value={approvalRecord} onChange={setApprovalRecord} />
        <RunButton
          label="Approve"
          busy={busy}
          isBusy={busy === "approve"}
          onClick={() => run("approve", () => approveInvoiceOnChain(approvalRecord, nowTimestamp()))}
        />
      </Section>

      <Section title="Approve with CPI invoice verification" program="wf_v2::approve_verified">
        <TextField label="Approval record plaintext" value={approvalRecord} onChange={setApprovalRecord} />
        <TextField label="Invoice hash (field)" value={invoiceHash} onChange={setInvoiceHash} />
        <RunButton
          label="Approve verified"
          busy={busy}
          isBusy={busy === "approve_verified"}
          onClick={() => run("approve_verified", () => approveVerified(approvalRecord, invoiceHash, nowTimestamp()))}
        />
      </Section>

      <Section title="Reject with reason" program="wf_v2::reject">
        <TextField label="Approval record plaintext" value={approvalRecord} onChange={setApprovalRecord} />
        <TextField label="Reason hash (field)" value={reasonHash} onChange={setReasonHash} />
        <RunButton
          label="Reject"
          busy={busy}
          isBusy={busy === "reject"}
          onClick={() => run("reject", () => rejectInvoiceOnChain(approvalRecord, reasonHash, nowTimestamp()))}
        />
      </Section>

      <Section title="Delegate approval authority" program="wf_v2::delegate">
        <TextField label="Approval record plaintext" value={approvalRecord} onChange={setApprovalRecord} />
        <TextField label="Delegate to (aleo1…)" value={delegateTo} onChange={setDelegateTo} />
        <RunButton
          label="Delegate"
          busy={busy}
          isBusy={busy === "delegate"}
          onClick={() => run("delegate", () => delegateApproval(approvalRecord, delegateTo, nowTimestamp()))}
        />
      </Section>

      <Section title="Check threshold met" program="wf_v2::check_threshold_met">
        <TextField label="Invoice id (field)" value={invoiceIdStr} onChange={setInvoiceIdStr} />
        <NumberField label="Required approvals" value={requiredApprovals} onChange={setRequiredApprovals} />
        <RunButton
          label="Check threshold"
          busy={busy}
          isBusy={busy === "check_threshold_met"}
          onClick={() => run("check_threshold_met", () => checkThresholdMet(invoiceIdStr, parseInt(requiredApprovals || "0", 10)))}
        />
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Payment tab — pay_v2 advanced primitives
// ──────────────────────────────────────────────────────────────────────────────

function PaymentTab({ run, busy }: { run: (label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) => Promise<void>; busy: string | null }) {
  const [creditsRecord, setCreditsRecord] = useState("");
  const [creditsRecord2, setCreditsRecord2] = useState("");
  const [payee, setPayee] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [amount, setAmount] = useState("0");
  const [invoiceAmount, setInvoiceAmount] = useState("0");
  const [invoiceHash, setInvoiceHash] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("0");
  const [escrowRecord, setEscrowRecord] = useState("");
  const [executeAfter, setExecuteAfter] = useState("0");
  const [paymentId, setPaymentId] = useState("");
  const [expectedAnchor, setExpectedAnchor] = useState("");
  const [splitAmount, setSplitAmount] = useState("0");

  return (
    <div>
      <Section title="Pay with CPI-verified invoice match" program="pay_v2::pay_verified_credits">
        <TextField label="Credits record plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <TextField label="Payee (aleo1…)" value={payee} onChange={setPayee} />
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <TextField label="Invoice hash (field)" value={invoiceHash} onChange={setInvoiceHash} />
        <NumberField label="Amount (microcredits)" value={amount} onChange={setAmount} />
        <NumberField label="Invoice amount (microcredits)" value={invoiceAmount} onChange={setInvoiceAmount} />
        <RunButton
          label="Pay verified"
          busy={busy}
          isBusy={busy === "pay_verified_credits"}
          onClick={() =>
            run("pay_verified_credits", () =>
              payVerifiedCredits({
                creditsRecord,
                payee,
                invoiceId,
                invoiceHash,
                amount: BigInt(amount || "0"),
                invoiceAmount: BigInt(invoiceAmount || "0"),
                paidAt: nowTimestamp(),
                nonce: generateNonce(),
              }),
            )
          }
        />
      </Section>

      <Section title="Lock funds in escrow" program="pay_v2::escrow_lock">
        <TextField label="Credits record plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <TextField label="Payee (aleo1…)" value={payee} onChange={setPayee} />
        <TextField label="Arbiter (aleo1…)" value={arbiter} onChange={setArbiter} />
        <NumberField label="Amount (microcredits)" value={amount} onChange={setAmount} />
        <NumberField label="Delivery deadline (unix ts)" value={deliveryDeadline} onChange={setDeliveryDeadline} />
        <RunButton
          label="Escrow lock"
          busy={busy}
          isBusy={busy === "escrow_lock"}
          onClick={() =>
            run("escrow_lock", () =>
              escrowLock({
                creditsRecord,
                invoiceId,
                payee,
                amount: BigInt(amount || "0"),
                deliveryDeadline: parseInt(deliveryDeadline || "0", 10),
                arbiter,
                nonce: generateNonce(),
              }),
            )
          }
        />
      </Section>

      <Section title="Release escrowed funds" program="pay_v2::escrow_release">
        <TextField label="Escrow record plaintext" value={escrowRecord} onChange={setEscrowRecord} />
        <RunButton label="Release" busy={busy} isBusy={busy === "escrow_release"} onClick={() => run("escrow_release", () => escrowRelease(escrowRecord))} />
      </Section>

      <Section title="Refund escrowed funds" program="pay_v2::escrow_refund">
        <TextField label="Escrow record plaintext" value={escrowRecord} onChange={setEscrowRecord} />
        <RunButton label="Refund" busy={busy} isBusy={busy === "escrow_refund"} onClick={() => run("escrow_refund", () => escrowRefund(escrowRecord))} />
      </Section>

      <Section title="Schedule a future payment" program="pay_v2::schedule_payment">
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <NumberField label="Execute after (unix ts)" value={executeAfter} onChange={setExecuteAfter} />
        <RunButton
          label="Schedule"
          busy={busy}
          isBusy={busy === "schedule_payment"}
          onClick={() =>
            run("schedule_payment", () =>
              schedulePayment({
                invoiceId,
                executeAfter: parseInt(executeAfter || "0", 10),
                nonce: generateNonce(),
              }),
            )
          }
        />
      </Section>

      <Section title="Execute a scheduled payment" program="pay_v2::execute_scheduled">
        <TextField label="Credits record plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <TextField label="Payee (aleo1…)" value={payee} onChange={setPayee} />
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <NumberField label="Amount (microcredits)" value={amount} onChange={setAmount} />
        <RunButton
          label="Execute scheduled"
          busy={busy}
          isBusy={busy === "execute_scheduled"}
          onClick={() =>
            run("execute_scheduled", () =>
              executeScheduledPayment({
                creditsRecord,
                payee,
                invoiceId,
                amount: BigInt(amount || "0"),
                nonce: generateNonce(),
              }),
            )
          }
        />
      </Section>

      <Section title="Verify payment exists on-chain" program="pay_v2::verify_payment">
        <TextField label="Payment id (field)" value={paymentId} onChange={setPaymentId} />
        <TextField label="Expected settlement anchor (field)" value={expectedAnchor} onChange={setExpectedAnchor} />
        <RunButton
          label="Verify"
          busy={busy}
          isBusy={busy === "verify_payment"}
          onClick={() => run("verify_payment", () => verifyPayment({ paymentId, expectedAnchor }))}
        />
      </Section>

      <Section title="Join two credits records" program="pay_v2::join_credits">
        <TextField label="Record A plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <TextField label="Record B plaintext" value={creditsRecord2} onChange={setCreditsRecord2} />
        <RunButton
          label="Join"
          busy={busy}
          isBusy={busy === "join_credits"}
          onClick={() => run("join_credits", () => joinCredits({ recordA: creditsRecord, recordB: creditsRecord2 }))}
        />
      </Section>

      <Section title="Split a credits record" program="pay_v2::split_credits">
        <TextField label="Record plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <NumberField label="Split amount (microcredits)" value={splitAmount} onChange={setSplitAmount} />
        <RunButton
          label="Split"
          busy={busy}
          isBusy={busy === "split_credits"}
          onClick={() =>
            run("split_credits", () =>
              splitCredits({ recordIn: creditsRecord, amount: BigInt(splitAmount || "0") }),
            )
          }
        />
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch tab — bat_v2 settle_slot
// ──────────────────────────────────────────────────────────────────────────────

function BatchTab({ run, busy }: { run: (label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) => Promise<void>; busy: string | null }) {
  const [batchSlotRecord, setBatchSlotRecord] = useState("");
  const [creditsRecord, setCreditsRecord] = useState("");

  return (
    <div>
      <Section title="Settle a slot from a closed epoch" program="bat_v2::settle_slot">
        <p className="font-mono text-[11px] text-black/60">
          Called after <code>close_epoch</code>. Reveals the slot commit and executes the payment.
        </p>
        <TextField label="Batch slot record plaintext" value={batchSlotRecord} onChange={setBatchSlotRecord} />
        <TextField label="Credits record plaintext" value={creditsRecord} onChange={setCreditsRecord} />
        <RunButton
          label="Settle slot"
          busy={busy}
          isBusy={busy === "settle_slot"}
          onClick={() => run("settle_slot", () => settleSlot(batchSlotRecord, creditsRecord))}
        />
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Audit tab — aud_v2 variants
// ──────────────────────────────────────────────────────────────────────────────

function AuditTab({ run, busy }: { run: (label: string, fn: () => Promise<{ transactionId: string | null; status: string; error?: string | null }>) => Promise<void>; busy: string | null }) {
  const wallet = useWalletStore();
  const [invoiceId, setInvoiceId] = useState("");
  const [expectedCommitment, setExpectedCommitment] = useState("");
  const [dateStart, setDateStart] = useState("0");
  const [dateEnd, setDateEnd] = useState("0");
  const [totalAmount, setTotalAmount] = useState("0");
  const [invoiceCount, setInvoiceCount] = useState("0");
  const [disclosedFields, setDisclosedFields] = useState("0");
  const [authorizedAddress, setAuthorizedAddress] = useState("");
  const [expiresAt, setExpiresAt] = useState("0");
  const [auditor, setAuditor] = useState("");
  const [totalPayments, setTotalPayments] = useState("0");
  const [totalApproved, setTotalApproved] = useState("0");
  const [onTimePayments, setOnTimePayments] = useState("0");
  const [totalVolume, setTotalVolume] = useState("0");
  const [accountAgeDays, setAccountAgeDays] = useState("0");
  const [minOnTimeBps, setMinOnTimeBps] = useState("0");

  return (
    <div>
      <Section title="Audit proof with CPI-verified invoice commitment" program="aud_v2::generate_verified_proof">
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <TextField label="Expected commitment (field)" value={expectedCommitment} onChange={setExpectedCommitment} />
        <NumberField label="Date start (unix)" value={dateStart} onChange={setDateStart} />
        <NumberField label="Date end (unix)" value={dateEnd} onChange={setDateEnd} />
        <NumberField label="Total amount (microcredits)" value={totalAmount} onChange={setTotalAmount} />
        <NumberField label="Invoice count" value={invoiceCount} onChange={setInvoiceCount} />
        <RunButton
          label="Generate verified proof"
          busy={busy}
          isBusy={busy === "generate_verified_proof"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("generate_verified_proof", () =>
              generateVerifiedProof({
                companyHash,
                invoiceId,
                expectedCommitment,
                dateStart: parseInt(dateStart || "0", 10),
                dateEnd: parseInt(dateEnd || "0", 10),
                totalAmount: BigInt(totalAmount || "0"),
                invoiceCount: BigInt(invoiceCount || "0"),
                nonce: generateNonce(),
              }),
            );
          }}
        />
      </Section>

      <Section title="Selective disclosure — reveal specific fields to auditor" program="aud_v2::selective_disclose">
        <TextField label="Invoice id (field)" value={invoiceId} onChange={setInvoiceId} />
        <TextField label="Disclosed-fields bitmap (field)" value={disclosedFields} onChange={setDisclosedFields} />
        <TextField label="Authorized auditor (aleo1…)" value={authorizedAddress} onChange={setAuthorizedAddress} />
        <NumberField label="Expires at (unix)" value={expiresAt} onChange={setExpiresAt} />
        <RunButton
          label="Disclose"
          busy={busy}
          isBusy={busy === "selective_disclose"}
          onClick={() =>
            run("selective_disclose", () =>
              selectiveDisclose({
                invoiceId,
                disclosedFields,
                authorizedAddress,
                expiresAt: parseInt(expiresAt || "0", 10),
                nonce: generateNonce(),
              }),
            )
          }
        />
      </Section>

      <Section title="Authorize auditor access" program="aud_v2::set_audit_authorization">
        <TextField label="Auditor (aleo1…)" value={auditor} onChange={setAuditor} />
        <NumberField label="Expires at (unix)" value={expiresAt} onChange={setExpiresAt} />
        <RunButton
          label="Authorize"
          busy={busy}
          isBusy={busy === "set_audit_authorization"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("set_audit_authorization", () =>
              setAuditAuthorization({
                companyHash,
                auditor,
                expiresAt: parseInt(expiresAt || "0", 10),
              }),
            );
          }}
        />
      </Section>

      <Section title="Revoke auditor access" program="aud_v2::revoke_audit_authorization">
        <TextField label="Auditor (aleo1…)" value={auditor} onChange={setAuditor} />
        <RunButton
          label="Revoke"
          busy={busy}
          isBusy={busy === "revoke_audit_authorization"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("revoke_audit_authorization", () =>
              revokeAuditAuthorization({ companyHash, auditor }),
            );
          }}
        />
      </Section>

      <Section title="Compliance proof (approved vs paid counts)" program="aud_v2::generate_compliance_proof">
        <NumberField label="Total payments" value={totalPayments} onChange={setTotalPayments} />
        <NumberField label="Total approved" value={totalApproved} onChange={setTotalApproved} />
        <RunButton
          label="Generate compliance proof"
          busy={busy}
          isBusy={busy === "generate_compliance_proof"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("generate_compliance_proof", () =>
              generateComplianceProof({
                companyHash,
                totalPayments: BigInt(totalPayments || "0"),
                totalApproved: BigInt(totalApproved || "0"),
                nonce: generateNonce(),
                generatedAt: nowTimestamp(),
              }),
            );
          }}
        />
      </Section>

      <Section title="Credit score proof (on-time payment ratio)" program="aud_v2::generate_credit_proof">
        <NumberField label="Total payments" value={totalPayments} onChange={setTotalPayments} />
        <NumberField label="On-time payments" value={onTimePayments} onChange={setOnTimePayments} />
        <NumberField label="Total volume (microcredits)" value={totalVolume} onChange={setTotalVolume} />
        <NumberField label="Account age (days)" value={accountAgeDays} onChange={setAccountAgeDays} />
        <NumberField label="Minimum on-time BPS (0-10000)" value={minOnTimeBps} onChange={setMinOnTimeBps} />
        <RunButton
          label="Generate credit proof"
          busy={busy}
          isBusy={busy === "generate_credit_proof"}
          onClick={async () => {
            if (!wallet.address) return;
            const companyHash = await hashToField(wallet.address);
            run("generate_credit_proof", () =>
              generateCreditProof({
                companyHash,
                totalPayments: BigInt(totalPayments || "0"),
                onTimePayments: BigInt(onTimePayments || "0"),
                totalVolume: BigInt(totalVolume || "0"),
                accountAgeDays: parseInt(accountAgeDays || "0", 10),
                nonce: generateNonce(),
                minOnTimeBps: BigInt(minOnTimeBps || "0"),
              }),
            );
          }}
        />
      </Section>
    </div>
  );
}
