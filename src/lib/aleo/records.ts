/**
 * Aleo Record Management
 *
 * On Aleo, every transaction consumes private records as inputs.
 * This module handles:
 * - Scanning wallet for available records
 * - Parsing record ciphertexts
 * - Finding records with sufficient balance
 * - Caching records locally to avoid redundant scans
 */

export interface ParsedRecord {
  id: string;
  programId: string;
  functionName: string;
  owner: string;
  data: Record<string, string>;
  nonce: string;
  ciphertext: string;
}

export interface CreditsRecord extends ParsedRecord {
  microcredits: bigint;
}

// Local cache to avoid re-scanning
let recordCache: Map<string, ParsedRecord[]> = new Map();
let lastScanTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Scan wallet for records belonging to a specific program.
 * Uses the wallet adapter's requestRecords() method.
 */
export async function getRecords(programId: string): Promise<ParsedRecord[]> {
  const cacheKey = programId;
  const now = Date.now();

  // Return cached if fresh
  if (recordCache.has(cacheKey) && now - lastScanTime < CACHE_TTL_MS) {
    return recordCache.get(cacheKey)!;
  }

  const w = window as unknown as Record<string, unknown>;

  // Try each wallet adapter
  const walletAPIs = [w.shield, w.leoWallet, w.puzzle, w.foxwallet].filter(Boolean);

  if (walletAPIs.length === 0) {
    return [];
  }

  const wallet = walletAPIs[0] as Record<string, Function>;

  try {
    // Standard Aleo wallet adapter interface
    let rawRecords: string[];

    if (wallet.requestRecords) {
      rawRecords = await wallet.requestRecords(programId);
    } else if (wallet.getRecords) {
      rawRecords = await wallet.getRecords(programId);
    } else {
      return [];
    }

    const parsed = rawRecords
      .map((raw: string) => parseRecordString(raw, programId))
      .filter((r): r is ParsedRecord => r !== null);

    recordCache.set(cacheKey, parsed);
    lastScanTime = now;

    return parsed;
  } catch {
    return [];
  }
}

/**
 * Get credits records and parse their microcredits value.
 */
export async function getCreditsRecords(): Promise<CreditsRecord[]> {
  const records = await getRecords("credits.aleo");

  return records.map((r) => ({
    ...r,
    microcredits: parseMicrocredits(r.data.microcredits || r.data.amount || "0"),
  }));
}

/**
 * Find the best credits record for a target payment amount.
 * Returns the smallest record that covers the amount (minimizes change).
 */
export function findRecordForAmount(
  records: CreditsRecord[],
  targetAmount: bigint
): CreditsRecord | null {
  // Filter records with sufficient balance
  const sufficient = records
    .filter((r) => r.microcredits >= targetAmount)
    .sort((a, b) => {
      // Sort ascending — pick smallest sufficient record
      if (a.microcredits < b.microcredits) return -1;
      if (a.microcredits > b.microcredits) return 1;
      return 0;
    });

  return sufficient[0] ?? null;
}

/**
 * Find multiple records that sum to at least the target amount.
 * Used when no single record is large enough.
 */
export function findRecordsForAmount(
  records: CreditsRecord[],
  targetAmount: bigint
): CreditsRecord[] {
  // First check if any single record works
  const single = findRecordForAmount(records, targetAmount);
  if (single) return [single];

  // Sort descending — greedy approach
  const sorted = [...records].sort((a, b) => {
    if (a.microcredits > b.microcredits) return -1;
    if (a.microcredits < b.microcredits) return 1;
    return 0;
  });

  let sum = BigInt(0);
  const selected: CreditsRecord[] = [];

  for (const record of sorted) {
    selected.push(record);
    sum += record.microcredits;
    if (sum >= targetAmount) break;
  }

  if (sum < targetAmount) return []; // Insufficient balance

  return selected;
}

/**
 * Get total balance across all credits records.
 */
export async function getTotalBalance(): Promise<{
  aleo: bigint;
  recordCount: number;
}> {
  const records = await getCreditsRecords();
  const total = records.reduce((sum, r) => sum + r.microcredits, BigInt(0));
  return { aleo: total, recordCount: records.length };
}

/**
 * Clear the record cache (call after a transaction).
 */
export function invalidateRecordCache() {
  recordCache.clear();
  lastScanTime = 0;
}

/**
 * Parse a record ciphertext string into structured data.
 * Handles both Leo-style and JSON-style record formats.
 */
function parseRecordString(raw: string, programId: string): ParsedRecord | null {
  try {
    // Try JSON format first (some wallets return JSON)
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw);
      return {
        id: parsed.id || parsed._nonce || "",
        programId,
        functionName: parsed.function || "",
        owner: parsed.owner || "",
        data: parsed.data || parsed,
        nonce: parsed._nonce || parsed.nonce || "",
        ciphertext: raw,
      };
    }

    // Leo record format: { owner: aleo1..., microcredits: 1000u64, ... }
    const ownerMatch = raw.match(/owner:\s*(aleo1[a-z0-9]+)/);
    const nonceMatch = raw.match(/_nonce:\s*(\d+group\.public)/);

    const data: Record<string, string> = {};
    const fieldMatches = raw.matchAll(/(\w+):\s*([^,}]+)/g);
    for (const match of fieldMatches) {
      if (match[1] !== "owner" && match[1] !== "_nonce") {
        data[match[1]] = match[2].trim();
      }
    }

    return {
      id: nonceMatch?.[1] || Math.random().toString(36).slice(2),
      programId,
      functionName: "",
      owner: ownerMatch?.[1] || "",
      data,
      nonce: nonceMatch?.[1] || "",
      ciphertext: raw,
    };
  } catch {
    return null;
  }
}

/**
 * Parse a microcredits string value to BigInt.
 * Handles "1000u64", "1000", "1000field" formats.
 */
function parseMicrocredits(value: string): bigint {
  const cleaned = value.replace(/u\d+$/, "").replace(/field$/, "").trim();
  try {
    return BigInt(cleaned);
  } catch {
    return BigInt(0);
  }
}
