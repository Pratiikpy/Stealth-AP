/**
 * StealthAP Batch Settlement — Frontend Integration
 * Wraps stealthap_bat_v2.aleo transitions for the UI
 */

import { executeTransaction } from "../proving";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_BATCH_PROGRAM_ID || "stealthap_bat_v2.aleo";

/**
 * Open a new batch epoch
 */
export async function openEpoch(companyHash: string, epochNumber: bigint) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "open_epoch",
    inputs: [`${companyHash}field`, `${epochNumber}u64`],
  });
}

/**
 * Commit a payment to an open epoch slot
 */
export async function commitPayment(params: {
  epochId: string;
  slot: number;
  invoiceId: string;
  payee: string;
  amount: bigint;
  token: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "commit_payment",
    inputs: [
      `${params.epochId}field`,
      `${params.slot}u8`,
      `${params.invoiceId}field`,
      params.payee,
      `${params.amount}u64`,
      `${params.token}u8`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Close epoch (lock for settlement)
 */
export async function closeEpoch(companyHash: string, epochNumber: bigint) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "close_epoch",
    inputs: [`${companyHash}field`, `${epochNumber}u64`],
  });
}

/**
 * Settle a batch slot (reveal + execute)
 */
export async function settleSlot(batchSlotRecord: string, creditsRecord: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "settle_slot",
    inputs: [batchSlotRecord, creditsRecord],
  });
}
