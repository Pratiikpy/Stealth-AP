/**
 * StealthAP Transaction Proving
 *
 * Three strategies:
 * 1. WALLET-BASED (primary) — Browser extension handles proving.
 * 2. SDK-BASED (burner) — @provablehq/sdk proves with private key in browser.
 * 3. DELEGATED (optional) — Provable DPS generates proof server-side.
 */

import { getTransaction, ALEO_API_URL, NETWORK } from "./client";
import { useWalletStore } from "@/stores/wallet-store";

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

// ═══════════════════════════════════════════
// STRATEGY 1: WALLET-BASED PROVING (Primary)
// ═══════════════════════════════════════════

export async function executeViaWallet(
  request: TransactionRequest
): Promise<TransactionResult> {
  const w = window as unknown as Record<string, unknown>;

  const walletAPIs = [
    w.shield,
    w.leoWallet,
    w.puzzle,
    w.foxwallet,
  ].filter(Boolean);

  if (walletAPIs.length === 0) {
    return {
      transactionId: null,
      status: "failed",
      error: "No wallet extension detected.",
    };
  }

  const wallet = walletAPIs[0] as Record<string, unknown>;

  try {
    const result = await (wallet.requestTransaction as Function)({
      type: "execute",
      programId: request.programId,
      functionName: request.functionName,
      inputs: request.inputs,
      fee: request.fee ?? 10000,
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
// STRATEGY 2: SDK-BASED PROVING (Burner Key)
// Uses @provablehq/sdk with private key
// ═══════════════════════════════════════════

export async function executeViaSdk(
  request: TransactionRequest,
  privateKey: string
): Promise<TransactionResult> {
  try {
    // Dynamic import to avoid loading WASM unless needed
    const sdk = await import("@provablehq/sdk");
    const { ProgramManager, AleoKeyProvider, AleoNetworkClient, NetworkRecordProvider, Account, initializeWasm } = sdk;

    // initializeWasm is deprecated in latest SDK — no longer needed

    const account = new Account({ privateKey });
    // SDK appends /testnet internally, so pass base URL only
    const networkClient = new AleoNetworkClient(ALEO_API_URL);
    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache(true);
    const recordProvider = new NetworkRecordProvider(account, networkClient);

    const programManager = new ProgramManager(
      ALEO_API_URL,
      keyProvider,
      recordProvider
    );
    programManager.setAccount(account);

    const txId = await programManager.execute({
      programName: request.programId,
      functionName: request.functionName,
      inputs: request.inputs,
      priorityFee: request.fee ?? 100000,
      privateFee: false,
    });

    return {
      transactionId: typeof txId === "string" ? txId : null,
      status: "submitted",
      error: null,
    };
  } catch (err) {
    return {
      transactionId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "SDK proving failed",
    };
  }
}

// ═══════════════════════════════════════════
// STRATEGY 3: DELEGATED PROVING (Optional)
// ═══════════════════════════════════════════

const DPS_URL =
  process.env.NEXT_PUBLIC_DPS_PROVER_URL ||
  "https://api.provable.com/prove/testnet";

const PROVABLE_API_KEY = process.env.PROVABLE_API_KEY || "";
const PROVABLE_CONSUMER_ID = process.env.PROVABLE_CONSUMER_ID || "";

export function isDPSAvailable(): boolean {
  return !!PROVABLE_API_KEY && !PROVABLE_API_KEY.includes("placeholder");
}

export async function executeViaDPS(
  request: TransactionRequest
): Promise<TransactionResult> {
  if (!isDPSAvailable()) {
    return {
      transactionId: null,
      status: "failed",
      error: "DPS not configured.",
    };
  }

  try {
    const res = await fetch(`${DPS_URL}/prove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PROVABLE_API_KEY}`,
        "X-Consumer-Id": PROVABLE_CONSUMER_ID,
      },
      body: JSON.stringify({
        program: request.programId,
        function: request.functionName,
        inputs: request.inputs,
        fee: request.fee ?? 10000,
        broadcast: true,
      }),
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
 * 1. Burner wallet (private key in store) → SDK proving
 * 2. Browser wallet extension → wallet proving
 * 3. DPS configured → delegated proving
 */
export async function executeTransaction(
  request: TransactionRequest
): Promise<TransactionResult> {
  // Check if burner wallet with private key
  const { privateKey } = useWalletStore.getState();
  if (privateKey) {
    return executeViaSdk(request, privateKey);
  }

  // Check for browser wallet extension
  const w = typeof window !== "undefined" ? window as unknown as Record<string, unknown> : {};
  const hasExtension = w.shield || w.leoWallet || w.puzzle || w.foxwallet;
  if (hasExtension) {
    return executeViaWallet(request);
  }

  // Fall back to DPS
  if (isDPSAvailable()) {
    return executeViaDPS(request);
  }

  return {
    transactionId: null,
    status: "failed",
    error: "No wallet connected. Connect Shield Wallet, paste a private key, or configure DPS.",
  };
}

// ═══════════════════════════════════════════
// CONFIRMATION POLLING
// ═══════════════════════════════════════════

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
