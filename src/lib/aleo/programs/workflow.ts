/**
 * StealthAP Workflow Program — Frontend Integration
 * Wraps stealthap_wf_v2.aleo transitions for the UI
 */

import { executeTransaction } from "../proving";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_WORKFLOW_PROGRAM_ID || "stealthap_wf_v2.aleo";

/**
 * Set approval threshold for a tier
 */
export async function setThreshold(params: {
  companyHash: string;
  tier: number;
  minAmount: bigint;
  maxAmount: bigint;
  approver: string;
  autoApprove: boolean;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "set_threshold",
    inputs: [
      `${params.companyHash}field`,
      `${params.tier}u8`,
      `${params.minAmount}u64`,
      `${params.maxAmount}u64`,
      params.approver,
      params.autoApprove ? "true" : "false",
    ],
  });
}

/**
 * Submit invoice for approval routing
 */
export async function submitForApproval(params: {
  invoiceId: string;
  approver: string;
  companyHash: string;
  amount: bigint;
  createdAt: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "submit_for_approval",
    inputs: [
      `${params.invoiceId}field`,
      params.approver,
      `${params.companyHash}field`,
      `${params.amount}u64`,
      `${params.createdAt}u32`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Approve an invoice (standard — public)
 */
export async function approveInvoiceOnChain(
  approvalRecord: string,
  decidedAt: number
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "approve",
    inputs: [approvalRecord, `${decidedAt}u32`],
  });
}

/**
 * Approve with invoice verification (CPI)
 */
export async function approveVerified(
  approvalRecord: string,
  invoiceHash: string,
  decidedAt: number
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "approve_verified",
    inputs: [approvalRecord, `${invoiceHash}field`, `${decidedAt}u32`],
  });
}

/**
 * Reject an invoice with reason
 */
export async function rejectInvoiceOnChain(
  approvalRecord: string,
  reasonHash: string,
  decidedAt: number
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "reject",
    inputs: [approvalRecord, `${reasonHash}field`, `${decidedAt}u32`],
  });
}

/**
 * Delegate approval to another address
 */
export async function delegateApproval(
  approvalRecord: string,
  delegateTo: string,
  decidedAt: number
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "delegate",
    inputs: [approvalRecord, delegateTo, `${decidedAt}u32`],
  });
}

/**
 * Private multi-sig approval (anonymous)
 */
export async function approvePrivate(invoiceId: string, nonce: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "approve_private",
    inputs: [`${invoiceId}field`, `${nonce}field`],
  });
}

/**
 * Check if approval threshold is met
 */
export async function checkThresholdMet(
  invoiceId: string,
  requiredApprovals: number
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "check_threshold_met",
    inputs: [`${invoiceId}field`, `${requiredApprovals}u8`],
  });
}

/**
 * Set spending limit for a category
 */
export async function setSpendingLimit(params: {
  companyHash: string;
  categoryHash: string;
  limitAmount: bigint;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "set_spending_limit",
    inputs: [
      `${params.companyHash}field`,
      `${params.categoryHash}field`,
      `${params.limitAmount}u64`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Record spend against a category limit
 */
export async function recordSpend(params: {
  companyHash: string;
  categoryHash: string;
  amount: bigint;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "record_spend",
    inputs: [
      `${params.companyHash}field`,
      `${params.categoryHash}field`,
      `${params.amount}u64`,
      `${params.nonce}field`,
    ],
  });
}
