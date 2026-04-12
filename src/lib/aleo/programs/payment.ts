/**
 * StealthAP Payment Program — Frontend Integration
 * Wraps stealthap_pay_v2.aleo transitions for the UI
 */

import { executeTransaction, type TransactionRequest } from "../proving";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_PAYMENT_PROGRAM_ID || "stealthap_pay_v2.aleo";

/**
 * Pay with ALEO credits (private)
 */
export async function payCreditsPrivate(params: {
  creditsRecord: string;
  payee: string;
  invoiceId: string;
  amount: bigint;
  paidAt: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "pay_credits_private",
    inputs: [
      params.creditsRecord,
      params.payee,
      `${params.invoiceId}field`,
      `${params.amount}u64`,
      `${params.paidAt}u32`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Pay with ALEO credits + verify invoice on-chain (CPI)
 */
export async function payVerifiedCredits(params: {
  creditsRecord: string;
  payee: string;
  invoiceId: string;
  invoiceHash: string;
  amount: bigint;
  invoiceAmount: bigint;
  paidAt: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "pay_verified_credits",
    inputs: [
      params.creditsRecord,
      params.payee,
      `${params.invoiceId}field`,
      `${params.invoiceHash}field`,
      `${params.amount}u64`,
      `${params.invoiceAmount}u64`,
      `${params.paidAt}u32`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Lock credits in escrow
 */
export async function escrowLock(params: {
  creditsRecord: string;
  invoiceId: string;
  payee: string;
  amount: bigint;
  deliveryDeadline: number;
  arbiter: string;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "escrow_lock",
    inputs: [
      params.creditsRecord,
      `${params.invoiceId}field`,
      params.payee,
      `${params.amount}u64`,
      `${params.deliveryDeadline}u32`,
      params.arbiter,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Release escrow to payee
 */
export async function escrowRelease(escrowRecord: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "escrow_release",
    inputs: [escrowRecord],
  });
}

/**
 * Refund escrow to payer (after deadline)
 */
export async function escrowRefund(escrowRecord: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "escrow_refund",
    inputs: [escrowRecord],
  });
}

/**
 * Schedule a payment for a specific block height
 */
export async function schedulePayment(params: {
  invoiceId: string;
  executeAfter: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "schedule_payment",
    inputs: [
      `${params.invoiceId}field`,
      `${params.executeAfter}u32`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Execute a previously scheduled payment
 */
export async function executeScheduledPayment(params: {
  creditsRecord: string;
  payee: string;
  invoiceId: string;
  amount: bigint;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "execute_scheduled",
    inputs: [
      params.creditsRecord,
      params.payee,
      `${params.invoiceId}field`,
      `${params.amount}u64`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Verify a payment on-chain by checking its settlement anchor
 */
export async function verifyPayment(params: {
  paymentId: string;
  expectedAnchor: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "verify_payment",
    inputs: [
      `${params.paymentId}field`,
      `${params.expectedAnchor}field`,
    ],
  });
}

/**
 * Join two credits records into one (UTXO consolidation)
 */
export async function joinCredits(params: {
  recordA: string;
  recordB: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "join_credits",
    inputs: [params.recordA, params.recordB],
  });
}

/**
 * Split a credits record into two (UTXO splitting)
 */
export async function splitCredits(params: {
  recordIn: string;
  amount: bigint;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "split_credits",
    inputs: [params.recordIn, `${params.amount}u64`],
  });
}
