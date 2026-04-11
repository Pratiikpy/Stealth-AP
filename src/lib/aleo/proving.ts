/**
 * StealthAP Transaction Proving
 *
 * Two strategies:
 * 1. WALLET-BASED (primary) — The connected wallet handles proving.
 *    No registration needed. Works with Shield, Leo, Puzzle, Fox.
 *    The wallet decides whether to prove locally or via its own backend.
 *
 * 2. DELEGATED (optional) — Provable DPS generates proof in TEE.
 *    Requires API key. Faster but needs registration.
 *    Use when wallet proving is too slow or for backend operations.
 */

import { getTransaction } from "./client";

// ═══════════════════════════════════════════
// STRATEGY 1: WALLET-BASED PROVING (Primary)
// No registration. No API key. Just works.
// ═══════════════════════════════════════════

export interface TransactionRequest {
  programId: string;
  functionName: string;
  inputs: string[];
  fee?: number;
}

export interface TransactionResult {
  transactionId: string | null;
  status: "submitted" | "confirmed" | "failed";
  error: string | null;
}

/**
 * Execute a transaction via the connected wallet.
 * The wallet handles proving internally.
 */
export async function executeViaWallet(
  request: TransactionRequest
): Promise<TransactionResult> {
  // The wallet adapter injects into window
  const w = window as unknown as Record<string, unknown>;

  // Try each wallet in order of preference
  const walletAPIs = [
    w.shieldWallet,
    w.leoWallet,
    w.puzzle,
    w.foxwallet,
  ].filter(Boolean);

  if (walletAPIs.length === 0) {
    return {
      transactionId: null,
      status: "failed",
      error: "No wallet connected. Please connect Shield, Leo, Puzzle, or Fox wallet.",
    };
  }

  const wallet = walletAPIs[0] as Record<string, unknown>;

  try {
    // Standard Aleo wallet adapter interface
    const result = await (wallet.requestTransaction as Function)({
      type: "execute",
      programId: request.programId,
      functionName: request.functionName,
      inputs: request.inputs,
      fee: request.fee ?? 10000, // 0.01 ALEO default fee
    });

    return {
      transactionId: (result as { transactionId?: string })?.transactionId ?? null,
      status: "submitted",
      error: null,
    };
  } catch (err) {
    return {
      transactionId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "Wallet transaction failed",
    };
  }
}

// ═══════════════════════════════════════════
// STRATEGY 2: DELEGATED PROVING (Optional)
// Requires Provable API key. Faster proving.
// ═══════════════════════════════════════════

const DPS_URL =
  process.env.NEXT_PUBLIC_DPS_PROVER_URL ||
  "https://api.provable.com/prove/testnet";

const PROVABLE_API_KEY = process.env.PROVABLE_API_KEY || "";
const PROVABLE_CONSUMER_ID = process.env.PROVABLE_CONSUMER_ID || "";

/**
 * Check if DPS is configured
 */
export function isDPSAvailable(): boolean {
  return !!PROVABLE_API_KEY && !PROVABLE_API_KEY.includes("placeholder");
}

/**
 * Execute via Provable Delegated Proving Service.
 * Only use if DPS is configured (isDPSAvailable() returns true).
 */
export async function executeViaDPS(
  request: TransactionRequest
): Promise<TransactionResult> {
  if (!isDPSAvailable()) {
    return {
      transactionId: null,
      status: "failed",
      error: "DPS not configured. Using wallet-based proving instead.",
    };
  }

  try {
    const payload = {
      program: request.programId,
      function: request.functionName,
      inputs: request.inputs,
      fee: request.fee ?? 10000,
      broadcast: true,
    };

    const res = await fetch(`${DPS_URL}/prove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PROVABLE_API_KEY}`,
        "X-Consumer-Id": PROVABLE_CONSUMER_ID,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DPS error: ${res.status} — ${errorText}`);
    }

    const result = await res.json();
    return {
      transactionId: result.transaction?.id ?? null,
      status: "submitted",
      error: null,
    };
  } catch (err) {
    return {
      transactionId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "DPS proving failed",
    };
  }
}

// ═══════════════════════════════════════════
// SMART EXECUTION — Auto-picks best strategy
// ═══════════════════════════════════════════

/**
 * Execute a transaction using the best available strategy:
 * 1. If DPS is configured → use DPS (faster)
 * 2. Otherwise → use connected wallet (no setup needed)
 */
export async function executeTransaction(
  request: TransactionRequest
): Promise<TransactionResult> {
  if (isDPSAvailable()) {
    return executeViaDPS(request);
  }
  return executeViaWallet(request);
}

// ═══════════════════════════════════════════
// CONFIRMATION POLLING
// ═══════════════════════════════════════════

/**
 * Poll for transaction confirmation on-chain.
 * Returns true when confirmed, false on timeout.
 */
export async function waitForConfirmation(
  txId: string,
  maxAttempts = 30,
  intervalMs = 5000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const tx = await getTransaction(txId);
      if (tx && tx.status === "accepted") {
        return true;
      }
    } catch {
      // Transaction not found yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
