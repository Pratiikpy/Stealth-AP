/**
 * Client-side cryptographic utilities for StealthAP
 * Used to prepare inputs for Aleo transactions
 */

/**
 * Generate a random nonce as a field-compatible string
 * Returns a BigInt-compatible random value
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(31); // 31 bytes fits in Aleo field
  crypto.getRandomValues(bytes);
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result.toString();
}

/**
 * Hash a string to a field-compatible value using SHA-256
 * (Client-side approximation — actual BHP256 runs in Leo)
 */
export async function hashToField(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to BigInt, truncate to fit Aleo field
  let result = BigInt(0);
  for (let i = 0; i < Math.min(hashArray.length, 31); i++) {
    result = (result << BigInt(8)) | BigInt(hashArray[i]);
  }
  return result.toString();
}

/**
 * Hash a file to detect duplicates
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert USD amount to microcredits
 * 1 USD = 1,000,000 microcredits
 */
export function usdToMicro(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/**
 * Convert microcredits to USD
 */
export function microToUsd(micro: bigint): number {
  return Number(micro) / 1_000_000;
}

/**
 * Get current Unix timestamp in seconds
 */
export function nowTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
