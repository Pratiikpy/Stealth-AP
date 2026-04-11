"use client";

import { useState, useCallback } from "react";
import { executeTransaction, waitForConfirmation, type TransactionResult } from "@/lib/aleo/proving";
import { useWalletStore } from "@/stores/wallet-store";
import { toastSuccess, toastError } from "@/lib/utils";

type TxPhase = "idle" | "signing" | "proving" | "broadcasting" | "confirming" | "confirmed" | "failed";

interface UseAleoTransactionReturn {
  phase: TxPhase;
  txId: string | null;
  error: string | null;
  progress: number;
  execute: (
    programId: string,
    functionName: string,
    inputs: string[],
    options?: { onSuccess?: (txId: string) => void; successMessage?: string }
  ) => Promise<TransactionResult>;
  reset: () => void;
}

/**
 * Hook for executing Aleo transactions with full lifecycle tracking.
 * Drives the ZK proof animation in the payment flow.
 *
 * Phases:
 * 1. signing — wallet prompts user to approve
 * 2. proving — ZK proof being generated (wallet or DPS)
 * 3. broadcasting — transaction submitted to Aleo network
 * 4. confirming — waiting for block confirmation
 * 5. confirmed — transaction accepted on-chain
 */
export function useAleoTransaction(): UseAleoTransactionReturn {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const { connected } = useWalletStore();

  const reset = useCallback(() => {
    setPhase("idle");
    setTxId(null);
    setError(null);
    setProgress(0);
  }, []);

  const execute = useCallback(
    async (
      programId: string,
      functionName: string,
      inputs: string[],
      options?: { onSuccess?: (txId: string) => void; successMessage?: string }
    ): Promise<TransactionResult> => {
      if (!connected) {
        const result: TransactionResult = {
          transactionId: null,
          status: "failed",
          error: "Wallet not connected",
        };
        toastError("Wallet not connected", "Please connect your wallet first.");
        return result;
      }

      try {
        // Phase 1: Signing
        setPhase("signing");
        setProgress(10);

        // Phase 2: Proving (the wallet or DPS handles this)
        setPhase("proving");
        setProgress(30);

        const result = await executeTransaction({
          programId,
          functionName,
          inputs,
        });

        if (result.status === "failed") {
          setPhase("failed");
          setError(result.error);
          setProgress(0);
          toastError("Transaction Failed", result.error ?? "Unknown error");
          return result;
        }

        // Phase 3: Broadcasting
        setPhase("broadcasting");
        setProgress(60);
        setTxId(result.transactionId);

        // Phase 4: Confirming
        if (result.transactionId) {
          setPhase("confirming");
          setProgress(80);

          const confirmed = await waitForConfirmation(result.transactionId, 20, 3000);

          if (confirmed) {
            setPhase("confirmed");
            setProgress(100);
            toastSuccess(
              options?.successMessage ?? "Transaction Confirmed",
              `TX: ${result.transactionId.slice(0, 12)}...`
            );
            options?.onSuccess?.(result.transactionId);
          } else {
            // Timeout — may still confirm later
            setPhase("confirmed");
            setProgress(100);
          }
        } else {
          setPhase("confirmed");
          setProgress(100);
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setPhase("failed");
        setError(message);
        setProgress(0);
        toastError("Transaction Failed", message);
        return { transactionId: null, status: "failed", error: message };
      }
    },
    [connected]
  );

  return { phase, txId, error, progress, execute, reset };
}
