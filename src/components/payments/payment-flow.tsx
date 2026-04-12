"use client";

import { useState } from "react";
import {
  Shield,
  Check,
  Banknote,
  ArrowRight,
  ChevronLeft,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrivacyIndicator } from "@/components/ui/privacy-indicator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatMicro } from "@/lib/format";
import { useWalletStore } from "@/stores/wallet-store";
import { useAleoTransaction } from "@/lib/hooks/use-aleo-transaction";
import { getCreditsRecords, findRecordForAmount, invalidateRecordCache, getTotalBalance } from "@/lib/aleo/records";
import { getMappingValue } from "@/lib/aleo/client";
import { generateNonce, nowTimestamp } from "@/lib/crypto";
import type { InvoiceRow as Invoice, CurrencyFlag } from "@/types";

/** Parse a raw `credits.aleo::account` mapping string like `"52000000u64"` into microcredits. */
function parseAccountMicrocredits(raw: string | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/"/g, "").replace(/u64$/, "").trim();
  if (cleaned === "null" || cleaned === "") return 0;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

type PaymentStep = "review" | "confirm" | "processing" | "success";

interface PaymentFlowProps {
  invoices: Invoice[];
  onClose: () => void;
  onComplete: () => void;
  onSuccess?: (invoices: Invoice[], txId?: string) => void;
  /** Called after a vendor-side mutation (e.g. payment_address save) so the
   *  parent can refetch its invoice list. Without this, the next payment for
   *  the same vendor still asks for the address the user just saved. */
  onVendorUpdated?: () => void;
}

export function PaymentFlow({
  invoices,
  onClose,
  onComplete,
  onSuccess,
  onVendorUpdated,
}: PaymentFlowProps) {
  const [step, setStep] = useState<PaymentStep>("review");
  const [token, setToken] = useState<CurrencyFlag>("ALEO");
  const [progress, setProgress] = useState(0);
  const [proofChecklist, setProofChecklist] = useState<string[]>([]);
  const [settlementTime, setSettlementTime] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [needsShield, setNeedsShield] = useState(false);
  const [shieldingProgress, setShieldingProgress] = useState(false);
  const { connected, privateKey } = useWalletStore();
  const isBurnerWallet = !!privateKey;

  // Resolve vendor payment address from invoice's joined vendor row
  const firstInv = invoices[0] as typeof invoices[0] & {
    vendors?: { payment_address?: string | null; name?: string };
    payment_address?: string | null;
    vendor_id?: string;
  };
  const existingAddress =
    resolvedAddress ||
    firstInv?.vendors?.payment_address ||
    firstInv?.payment_address ||
    null;
  const needsAddress = !existingAddress || !existingAddress.startsWith("aleo1");

  async function saveVendorAddress() {
    const addr = addressInput.trim();
    if (!addr.startsWith("aleo1") || addr.length < 60) {
      toast.error("Address must start with aleo1 and be ~63 characters");
      return;
    }
    if (!firstInv.vendor_id) {
      // No vendor_id — just use the address locally for this payment
      setResolvedAddress(addr);
      toast.success("Address set for this payment");
      return;
    }
    setSavingAddress(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: firstInv.vendor_id, payment_address: addr }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update vendor");
      }
      setResolvedAddress(addr);
      // Patch the in-memory invoice so this panel session stops asking. The
      // parent still needs a refetch for subsequent invoices of the same
      // vendor; onVendorUpdated triggers that.
      if (firstInv.vendors) firstInv.vendors.payment_address = addr;
      else (firstInv as unknown as Record<string, unknown>).vendors = { payment_address: addr, name: firstInv.vendor_name };
      onVendorUpdated?.();
      toast.success("Vendor address saved for all future payments");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  }

  const totalMicro = invoices.reduce((sum, inv) => sum + inv.total_micro, 0);
  const isBatch = invoices.length > 1;
  const aleoTx = useAleoTransaction();

  /**
   * Return to the review step and clear all processing UI state. Call this
   * from every early-return in the pay flow so the progress bar never stays
   * pinned at whatever value it had when we bailed.
   */
  function bailToReview() {
    setStep("review");
    setProgress(0);
    setProofChecklist([]);
  }

  async function handleConfirmPay() {
    if (!connected) {
      toast.error("Connect your wallet first");
      return;
    }

    const payeeAddress = existingAddress;
    if (!payeeAddress || !payeeAddress.startsWith("aleo1")) {
      toast.error("Please set the vendor's payment address above");
      return;
    }

    setStep("processing");
    const startTime = Date.now();

    try {
      const PAYMENT_PROGRAM = process.env.NEXT_PUBLIC_PAYMENT_PROGRAM_ID || "stealthap_pay_v2.aleo";
      const nonce = generateNonce();

      // Sentinel passed when no ciphertext is available client-side.
      // The server-side SDK route resolves it via NetworkRecordProvider.
      let payRecordCiphertext: string = "__AUTO_RECORD__";

      // Step 1: Try to find a private record locally (extension wallets only —
      // burner can't scan records from the browser without heavy WASM).
      if (!isBurnerWallet) {
        setProofChecklist(["Scanning wallet for private records"]);
        setProgress(15);
        const creditsRecords = await getCreditsRecords();
        const payRecord = findRecordForAmount(creditsRecords, BigInt(totalMicro));
        if (payRecord) {
          payRecordCiphertext = payRecord.ciphertext;
          setProofChecklist((prev) => [...prev, "Credits record found"]);
          setProgress(40);
        } else if (creditsRecords.length >= 2) {
          // No single record is large enough. Check whether summing the two
          // biggest would cover the spend — if so, ask the user to join them
          // via credits.aleo::join before retrying. (pay_credits_private takes
          // exactly one credits record as input; multi-record spend is not
          // supported by the contract signature.)
          const sorted = [...creditsRecords].sort((a, b) =>
            a.microcredits > b.microcredits ? -1 : a.microcredits < b.microcredits ? 1 : 0
          );
          const topTwoSum = sorted[0].microcredits + sorted[1].microcredits;
          if (topTwoSum >= BigInt(totalMicro)) {
            const r1 = sorted[0], r2 = sorted[1];
            toast.info(`Your largest record is ${formatMicro(Number(r1.microcredits))}. Merging two records to cover ${formatMicro(totalMicro)}...`);
            const joinResult = await aleoTx.execute(
              "credits.aleo",
              "join",
              [r1.ciphertext, r2.ciphertext],
              { successMessage: "Records merged — wait ~2 min, then retry Pay." }
            );
            if (joinResult.status === "failed") {
              toast.error(joinResult.error || "Failed to merge records");
              bailToReview();
              return;
            }
            invalidateRecordCache();
            toast.info("Wait ~2 min for chain confirmation, then click Pay.");
            bailToReview();
            return;
          }
        }
      } else {
        setProofChecklist(["Burner mode — server will resolve record"]);
        setProgress(25);
      }

      // Step 2: If we still don't have a private record ciphertext, check public
      // balance on-chain and offer the shield flow. Applies to BOTH extension and
      // burner wallets — burner users with only public balance otherwise hit a
      // cryptic SDK error when the server can't find a record to spend.
      if (payRecordCiphertext === "__AUTO_RECORD__") {
        const { address } = useWalletStore.getState();
        if (!address) {
          toast.error("Wallet address unavailable");
          bailToReview();
          return;
        }

        // Refetch on-chain public balance — store value may be stale or unset.
        const raw = await getMappingValue("credits.aleo", "account", address);
        const publicBalance = parseAccountMicrocredits(raw);
        useWalletStore.getState().setBalance({ aleo: publicBalance });

        if (publicBalance >= totalMicro) {
          toast.info(
            isBurnerWallet
              ? "Shielding public balance so the SDK can spend it privately..."
              : "No private record — shielding public balance first."
          );

          const shieldResult = await aleoTx.execute(
            "credits.aleo",
            "transfer_public_to_private",
            [address, `${totalMicro}u64`],
            { successMessage: "Funds shielded — wait ~2 min, then retry Pay." }
          );

          if (shieldResult.status === "failed") {
            toast.error(shieldResult.error || "Failed to shield funds");
            bailToReview();
            return;
          }

          invalidateRecordCache();
          toast.info("Wait ~2 min for chain confirmation, then click Pay.");
          bailToReview();
          return;
        }

        // No public balance. For burner, server-side may still find a private
        // record; let the execute call proceed with the sentinel. For extension
        // wallets, we already scanned — genuinely insufficient funds.
        if (!isBurnerWallet) {
          const records = await getCreditsRecords();
          const totalPrivate = records.reduce((s, r) => s + r.microcredits, BigInt(0));
          const detail =
            records.length === 0
              ? "Wallet returned 0 records. Open DevTools console and look for [records] warnings — likely a DecryptPermission issue."
              : `Private records total ${formatMicro(Number(totalPrivate))} across ${records.length} record(s); none individually ≥ ${formatMicro(totalMicro)}. Use credits.aleo::join to merge, or pay a smaller amount.`;
          toast.error(
            `Can't pay ${formatMicro(totalMicro)} ALEO. Public: ${formatMicro(publicBalance)}. ${detail}`,
            { duration: 12000 }
          );
          bailToReview();
          return;
        }
      }

      setProofChecklist((prev) => [...prev, "Generating zero-knowledge proof"]);
      setProgress(70);

      // Contract signature: (pay_record, payee, invoice_id, amount, invoice_amount, paid_at, nonce)
      const result = await aleoTx.execute(
        PAYMENT_PROGRAM,
        "pay_credits_private",
        [
          payRecordCiphertext,
          payeeAddress,
          `${invoices[0].invoice_hash || "0"}field`,
          `${totalMicro}u64`,
          `${totalMicro}u64`,
          `${nowTimestamp()}u32`,
          `${nonce}field`,
        ],
        { successMessage: `Payment of ${formatMicro(totalMicro)} ALEO confirmed` }
      );

      if (result.status === "failed") {
        toast.error(result.error || "Transaction failed on-chain");
        bailToReview();
        return;
      }

      invalidateRecordCache();
      getTotalBalance().then(({ aleo }) => {
        useWalletStore.getState().setBalance({ aleo: Number(aleo) });
      }).catch(() => {});

      setProofChecklist((prev) => [...prev, "Broadcasting to Aleo"]);
      setProgress(100);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      setSettlementTime(`${elapsed}s`);

      onSuccess?.(invoices, aleoTx.txId ?? undefined);
      setStep("success");
    } catch (err) {
      console.error("[PaymentFlow] Error:", err);
      toast.error(err instanceof Error ? err.message : "Payment failed. Please try again.");
      bailToReview();
    }
  }

  // ── Step 1: Review ──
  if (step === "review") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Payment Review</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-4 hover:bg-surface-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm text-text-2">
          <span>
            <span className="font-medium text-text-1">{invoices.length}</span>{" "}
            invoice{invoices.length > 1 ? "s" : ""}
          </span>
          <span>
            Total:{" "}
            <span className="font-semibold text-text-1 tabular-nums">
              {formatMicro(totalMicro)}
            </span>
          </span>
          <span>Settlement: ~2 min</span>
        </div>

        {/* Invoice list */}
        <div className="rounded-lg border border-border bg-surface-2 divide-y divide-border">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-1 truncate">
                  {inv.vendor_name}
                </p>
                <p className="text-xs text-text-4">
                  {inv.invoice_number} · Due {inv.due_date}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums text-text-1 shrink-0 ml-4">
                {formatMicro(inv.total_micro)}
              </p>
            </div>
          ))}
        </div>

        {/* Token — ALEO only for now */}
        <div>
          <label className="block text-sm font-medium text-text-2 mb-2">
            Pay with
          </label>
          <div className="flex gap-2">
            <button
              disabled
              className="flex-1 border-2 border-black bg-[#C6F15C] px-4 py-2.5 text-sm font-mono font-bold uppercase tracking-wider text-black"
            >
              ALEO
            </button>
            <button
              disabled
              title="Stablecoin payments coming in v3"
              className="flex-1 border-2 border-black bg-white px-4 py-2.5 text-sm font-mono font-bold uppercase tracking-wider text-black/30 cursor-not-allowed"
            >
              USDCx (soon)
            </button>
            <button
              disabled
              title="Stablecoin payments coming in v3"
              className="flex-1 border-2 border-black bg-white px-4 py-2.5 text-sm font-mono font-bold uppercase tracking-wider text-black/30 cursor-not-allowed"
            >
              USAD (soon)
            </button>
          </div>
        </div>

        {/* Payee address — show existing or prompt to enter */}
        <div>
          <label className="block font-mono text-xs font-bold uppercase tracking-wider text-text-3 mb-2">
            Payee Address
          </label>
          {!needsAddress ? (
            <div className="border-2 border-black bg-[#C6F15C] p-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-black/60 mb-1">
                {firstInv?.vendors?.name || "Vendor"}
              </p>
              <p className="font-mono text-[11px] text-black break-all">
                {existingAddress}
              </p>
            </div>
          ) : (
            <div className="border-2 border-black bg-[#FF90E8]/20 p-3 space-y-2">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-black">
                Vendor has no payment address. Add one:
              </p>
              <input
                type="text"
                placeholder="aleo1..."
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="w-full border-2 border-black bg-white font-mono text-[11px] p-2 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              />
              <button
                onClick={saveVendorAddress}
                disabled={savingAddress || !addressInput}
                className="w-full bg-black text-[#C6F15C] border-2 border-black font-mono text-[11px] font-bold uppercase tracking-wider py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40"
              >
                {savingAddress ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          )}
        </div>

        <PrivacyIndicator message="These payments will be processed privately. No vendor names or amounts will be visible on-chain." />

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setStep("confirm")}
            className="flex-1"
            icon={<ArrowRight className="h-4 w-4" />}
            disabled={needsAddress}
          >
            Continue to Payment
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2: Confirm ──
  if (step === "confirm") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep("review")}
            className="p-1.5 rounded-md text-text-4 hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold">Confirm & Pay</h2>
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-border bg-surface-1 p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-2">Total Amount</span>
            <span className="font-semibold text-xl tabular-nums text-text-1">
              {formatMicro(totalMicro)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-2">Network Fee</span>
            <span className="text-text-1">~$0.15 (sponsored)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-2">Settlement Time</span>
            <span className="text-text-1">~2 minutes</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-2">Token</span>
            <span className="text-text-1">{token}</span>
          </div>
        </div>

        {/* Privacy checklist */}
        <div className="rounded-lg border border-accent/20 bg-accent-muted p-4 space-y-2">
          <p className="text-sm font-medium text-accent">
            Privacy Protection Applied
          </p>
          {[
            "Vendor names hashed on-chain",
            "Payment amounts encrypted",
            "Sender/receiver addresses hidden",
            "ZK proof generated for audit",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs text-accent/80">{item}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleConfirmPay}
            className="flex-1"
            disabled={!connected}
            icon={<Banknote className="h-4 w-4" />}
          >
            {connected
              ? `Confirm & Pay ${formatMicro(totalMicro)}`
              : "Connect Wallet First"}
          </Button>
          <Button variant="secondary" onClick={() => setStep("review")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: Processing (ZK Proof Animation) ──
  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        {/* Shield pulse */}
        <div className="relative">
          <Shield className="h-16 w-16 text-accent animate-pulse" />
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-accent/10 animate-ping" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-text-1">
            Processing Payment
          </p>
          <p className="text-sm text-text-2">
            Your vendor details are being encrypted
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-4 text-center mt-2 tabular-nums">
            {progress}%
          </p>
        </div>

        {/* Checklist */}
        <div className="space-y-2 w-full max-w-xs">
          {[
            "Vendor names hashed",
            "Payment amounts encrypted",
            "Generating zero-knowledge proof",
            "Broadcasting to Aleo",
          ].map((item) => {
            const isDone = proofChecklist.includes(item);
            const isCurrent =
              !isDone &&
              proofChecklist.length ===
                [
                  "Vendor names hashed",
                  "Payment amounts encrypted",
                  "Generating zero-knowledge proof",
                  "Broadcasting to Aleo",
                ].indexOf(item);

            return (
              <div key={item} className="flex items-center gap-2.5">
                {isDone ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 text-accent animate-spin" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-border" />
                )}
                <span
                  className={cn(
                    "text-sm",
                    isDone
                      ? "text-text-1"
                      : isCurrent
                        ? "text-accent"
                        : "text-text-4"
                  )}
                >
                  {item}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 4: Success ──
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      {/* Success icon */}
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
        <Check className="h-8 w-8 text-success" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-2xl font-bold text-text-1">
          Payment Complete
        </p>
        <p className="text-lg tabular-nums text-text-2">
          Settled in {settlementTime}
        </p>
      </div>

      {/* Confirmation details */}
      <div className="rounded-lg border border-border bg-surface-1p-4 w-full max-w-sm space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-3.5 w-3.5 text-success" />
          <span className="text-text-2">
            {invoices.length} invoice{invoices.length > 1 ? "s" : ""} paid
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-3.5 w-3.5 text-success" />
          <span className="text-text-2">Vendors notified</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-3.5 w-3.5 text-accent" />
          <span className="text-text-2">
            Privacy verified — no data visible on-chain
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onComplete}>Back to Dashboard</Button>
        <Button variant="secondary" onClick={() => {
          setStep("review");
          setProgress(0);
          setProofChecklist([]);
          setSettlementTime(null);
        }}>
          Pay More
        </Button>
      </div>
    </div>
  );
}
