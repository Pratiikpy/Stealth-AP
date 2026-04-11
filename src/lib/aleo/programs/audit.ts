/**
 * StealthAP Audit Program — Frontend Integration
 * Wraps stealthap_aud_v2.aleo transitions for the UI
 */

import { executeTransaction } from "../proving";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_AUDIT_PROGRAM_ID || "stealthap_aud_v2.aleo";

/**
 * Generate an audit proof for a date range
 */
export async function generateAuditProof(params: {
  companyHash: string;
  dateStart: number;
  dateEnd: number;
  totalAmount: bigint;
  invoiceCount: bigint;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "generate_audit_proof",
    inputs: [
      `${params.companyHash}field`,
      `${params.dateStart}u32`,
      `${params.dateEnd}u32`,
      `${params.totalAmount}u64`,
      `${params.invoiceCount}u64`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Generate verified audit proof (CPI — verifies commitment)
 */
export async function generateVerifiedProof(params: {
  companyHash: string;
  invoiceId: string;
  expectedCommitment: string;
  dateStart: number;
  dateEnd: number;
  totalAmount: bigint;
  invoiceCount: bigint;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "generate_verified_proof",
    inputs: [
      `${params.companyHash}field`,
      `${params.invoiceId}field`,
      `${params.expectedCommitment}field`,
      `${params.dateStart}u32`,
      `${params.dateEnd}u32`,
      `${params.totalAmount}u64`,
      `${params.invoiceCount}u64`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Selective disclosure — reveal specific fields to auditor
 */
export async function selectiveDisclose(params: {
  invoiceId: string;
  disclosedFields: string;
  authorizedAddress: string;
  expiresAt: number;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "selective_disclose",
    inputs: [
      `${params.invoiceId}field`,
      `${params.disclosedFields}field`,
      params.authorizedAddress,
      `${params.expiresAt}u32`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Grant audit authorization to an address
 */
export async function setAuditAuthorization(params: {
  companyHash: string;
  auditor: string;
  expiresAt: number;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "set_audit_authorization",
    inputs: [
      `${params.companyHash}field`,
      params.auditor,
      `${params.expiresAt}u32`,
    ],
  });
}

/**
 * Revoke audit authorization
 */
export async function revokeAuditAuthorization(params: {
  companyHash: string;
  auditor: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "revoke_audit_authorization",
    inputs: [`${params.companyHash}field`, params.auditor],
  });
}

/**
 * Generate compliance proof
 */
export async function generateComplianceProof(params: {
  companyHash: string;
  totalPayments: bigint;
  totalApproved: bigint;
  nonce: string;
  generatedAt: number;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "generate_compliance_proof",
    inputs: [
      `${params.companyHash}field`,
      `${params.totalPayments}u64`,
      `${params.totalApproved}u64`,
      `${params.nonce}field`,
      `${params.generatedAt}u32`,
    ],
  });
}

/**
 * Generate credit score proof
 */
export async function generateCreditProof(params: {
  companyHash: string;
  totalPayments: bigint;
  onTimePayments: bigint;
  totalVolume: bigint;
  accountAgeDays: number;
  nonce: string;
  minOnTimeBps: bigint;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "generate_credit_proof",
    inputs: [
      `${params.companyHash}field`,
      `${params.totalPayments}u64`,
      `${params.onTimePayments}u64`,
      `${params.totalVolume}u64`,
      `${params.accountAgeDays}u32`,
      `${params.nonce}field`,
      `${params.minOnTimeBps}u64`,
    ],
  });
}
