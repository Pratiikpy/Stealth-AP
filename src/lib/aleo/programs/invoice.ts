/**
 * StealthAP Invoice Program — Frontend Integration
 * Wraps stealthap_inv_v2.aleo transitions for the UI
 */

import { executeTransaction, type TransactionRequest } from "../proving";

const PROGRAM_ID =
  process.env.NEXT_PUBLIC_INVOICE_PROGRAM_ID || "stealthap_inv_v2.aleo";

/**
 * Create a new invoice on-chain with dual records (company + vendor)
 */
export async function createInvoiceOnChain(params: {
  companyHash: string;
  vendorHash: string;
  vendorAddress: string;
  amount: bigint;
  taxAmount: bigint;
  currencyFlag: number;
  dueDate: number;
  createdAt: number;
  glCodeHash: string;
  poHash: string;
  itemsHash: string;
  memoHash: string;
  nonce: string;
  categoryHash: string;
}) {
  const request: TransactionRequest = {
    programId: PROGRAM_ID,
    functionName: "create_invoice",
    inputs: [
      `${params.companyHash}field`,
      `${params.vendorHash}field`,
      params.vendorAddress,
      `${params.amount}u64`,
      `${params.taxAmount}u64`,
      `${params.currencyFlag}u8`,
      `${params.dueDate}u32`,
      `${params.createdAt}u32`,
      `${params.glCodeHash}field`,
      `${params.poHash}field`,
      `${params.itemsHash}field`,
      `${params.memoHash}field`,
      `${params.nonce}field`,
      `${params.categoryHash}field`,
    ],
  };

  return executeTransaction(request);
}

/**
 * Submit a draft invoice for approval
 */
export async function submitInvoiceOnChain(invoiceRecord: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "submit_invoice",
    inputs: [invoiceRecord],
  });
}

/**
 * Mark an invoice as approved
 */
export async function markInvoiceApproved(
  invoiceRecord: string,
  approverAddress: string
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "mark_approved",
    inputs: [invoiceRecord, approverAddress],
  });
}

/**
 * Mark an invoice as rejected
 */
export async function markInvoiceRejected(
  invoiceRecord: string,
  reasonHash: string
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "mark_rejected",
    inputs: [invoiceRecord, `${reasonHash}field`],
  });
}

/**
 * Mark an invoice as paid
 */
export async function markInvoicePaid(
  invoiceRecord: string,
  settlementAnchor: string
) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "mark_paid",
    inputs: [invoiceRecord, `${settlementAnchor}field`],
  });
}

/**
 * Cancel a draft or pending invoice
 */
export async function cancelInvoiceOnChain(invoiceRecord: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "cancel_invoice",
    inputs: [invoiceRecord],
  });
}

/**
 * Register a vendor on-chain
 */
export async function registerVendorOnChain(params: {
  companyHash: string;
  nameHash: string;
  paymentAddress: string;
  defaultToken: number;
  categoryHash: string;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "register_vendor",
    inputs: [
      `${params.companyHash}field`,
      `${params.nameHash}field`,
      params.paymentAddress,
      `${params.defaultToken}u8`,
      `${params.categoryHash}field`,
      `${params.nonce}field`,
    ],
  });
}

/**
 * Verify vendor is in Merkle allowlist (ZK proof)
 */
export async function verifyVendorAllowlist(params: {
  vendorHash: string;
  merkleRoot: string;
  proofPath: string[]; // 8 field values
  proofSides: boolean[]; // 8 booleans
}) {
  // Leo expects struct literals, not JSON
  const proofLow = `{ p0: ${params.proofPath[0]}field, p1: ${params.proofPath[1]}field, p2: ${params.proofPath[2]}field, p3: ${params.proofPath[3]}field, s0: ${params.proofSides[0]}, s1: ${params.proofSides[1]}, s2: ${params.proofSides[2]}, s3: ${params.proofSides[3]} }`;
  const proofHigh = `{ p4: ${params.proofPath[4]}field, p5: ${params.proofPath[5]}field, p6: ${params.proofPath[6]}field, p7: ${params.proofPath[7]}field, s4: ${params.proofSides[4]}, s5: ${params.proofSides[5]}, s6: ${params.proofSides[6]}, s7: ${params.proofSides[7]} }`;

  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "verify_vendor_allowlist",
    inputs: [
      `${params.vendorHash}field`,
      `${params.merkleRoot}field`,
      proofLow,
      proofHigh,
    ],
  });
}

/**
 * Generate a pseudonym for privacy
 */
export async function generatePseudonym(params: {
  realAddress: string;
  invoiceId: string;
  rotationNonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "generate_pseudonym",
    inputs: [
      params.realAddress,
      `${params.invoiceId}field`,
      `${params.rotationNonce}field`,
    ],
  });
}

/**
 * Check for duplicate invoice
 */
export async function checkDuplicateOnChain(pdfContentHash: string) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "check_duplicate",
    inputs: [`${pdfContentHash}field`],
  });
}

/**
 * Update a vendor's payment address and default token
 */
export async function updateVendor(params: {
  vendorRecord: string;
  newPaymentAddress: string;
  newDefaultToken: number;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "update_vendor",
    inputs: [
      params.vendorRecord,
      params.newPaymentAddress,
      `${params.newDefaultToken}u8`,
    ],
  });
}

/**
 * Deactivate a vendor on-chain
 */
export async function deactivateVendor(params: {
  vendorRecord: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "deactivate_vendor",
    inputs: [params.vendorRecord],
  });
}

/**
 * Set vendor allowlist via Merkle root (admin operation)
 */
export async function setVendorAllowlist(params: {
  companyHash: string;
  merkleRoot: string;
  nonce: string;
}) {
  return executeTransaction({
    programId: PROGRAM_ID,
    functionName: "set_vendor_allowlist",
    inputs: [
      `${params.companyHash}field`,
      `${params.merkleRoot}field`,
      `${params.nonce}field`,
    ],
  });
}
