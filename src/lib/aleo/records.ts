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
  /**
   * The serialized form to pass as a record input when calling
   * `requestTransaction`. Either the plaintext string the wallet returned
   * (e.g. `{owner: aleo1…, microcredits: 5u64.private, …}`) or, if the wallet
   * returned a structured object, `JSON.stringify(object)`. Leo / Shield /
   * Puzzle wallet adapters accept both shapes.
   */
  ciphertext: string;
  /** True when this record has already been consumed in a prior tx. */
  spent: boolean;
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
 *
 * Emits console diagnostics under the `[records]` prefix so the user can
 * surface exactly what Shield/Leo/Puzzle returned when the pay flow trips
 * "insufficient balance" — the remedy differs depending on whether the
 * wallet returned nothing, returned encrypted ciphertexts, or returned
 * plaintext records that are individually too small.
 */
export async function getRecords(programId: string): Promise<ParsedRecord[]> {
  const cacheKey = programId;
  const now = Date.now();

  if (recordCache.has(cacheKey) && now - lastScanTime < CACHE_TTL_MS) {
    return recordCache.get(cacheKey)!;
  }

  const w = window as unknown as Record<string, unknown>;
  const walletAPIs = [w.shield, w.leoWallet, w.puzzle, w.foxwallet].filter(Boolean);

  if (walletAPIs.length === 0) {
    console.warn("[records] no wallet extension detected on window (shield|leoWallet|puzzle|foxwallet)");
    return [];
  }

  const wallet = walletAPIs[0] as Record<string, Function>;
  const walletLabel = w.shield ? "shield" : w.leoWallet ? "leo" : w.puzzle ? "puzzle" : "fox";

  try {
    // Canonical Aleo wallet adapter API: requestRecords(programId) or the
    // newer requestRecordPlaintexts(programId). Both return { records: [...] }
    // per the demox-labs adapter spec (see Alpaca's WalletServiceImpl.ts:188-196
    // for the reference unwrap pattern).
    const requestFn = (wallet.requestRecords || wallet.requestRecordPlaintexts || wallet.getRecords) as
      | ((p: string, includePlaintext?: boolean) => Promise<unknown>)
      | undefined;

    if (!requestFn) {
      console.warn(`[records] ${walletLabel} exposes none of: requestRecords, requestRecordPlaintexts, getRecords`);
      return [];
    }

    // Shield's requestRecords accepts (program, includePlaintext) — passing
    // true makes Shield attach the Aleo plaintext string to each record
    // object. That plaintext is exactly what Shield's executeTransaction
    // wants back as a record input, so we avoid the lossy regex
    // reconstruction path. Leo/Puzzle/Fox ignore the extra boolean arg.
    const response = await requestFn.call(wallet, programId, true);

    // Unwrap: the wallet may return either { records: [...] } (canonical) or
    // a bare array (older adapter builds). Handle both.
    let rawRecords: unknown[];
    if (Array.isArray(response)) {
      rawRecords = response;
    } else if (response && typeof response === "object" && Array.isArray((response as { records?: unknown[] }).records)) {
      rawRecords = (response as { records: unknown[] }).records;
    } else {
      console.warn(`[records] ${walletLabel} returned unexpected shape:`, response);
      rawRecords = [];
    }

    console.log(`[records] ${walletLabel}.requestRecords("${programId}") returned ${rawRecords.length} record(s)`);
    if (rawRecords.length > 0) {
      // Log the first record's raw shape so the user can see what the wallet
      // is actually handing us — string vs object, plaintext vs ciphertext.
      const sample = rawRecords[0];
      console.log(`[records] first record type: ${typeof sample}`, sample);
    }

    const parsed = rawRecords
      .map((raw) => normalizeRecord(raw, programId))
      .filter((r): r is ParsedRecord => r !== null);

    const unspent = parsed.filter((r) => !r.spent);
    console.log(`[records] parsed ${parsed.length} record(s), ${unspent.length} unspent`);

    recordCache.set(cacheKey, unspent);
    lastScanTime = now;
    return unspent;
  } catch (err) {
    console.error(`[records] ${walletLabel} fetch failed:`, err);
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
 * Normalize whatever the wallet handed us into a `ParsedRecord`.
 *
 * Wallets return records in three observed shapes:
 *   A. Structured object (canonical):
 *        { id, owner, programId, spent, data: { microcredits: "5u64.private" }, … }
 *      This is what `@demox-labs/aleo-wallet-adapter-*` returns, and what
 *      Shield/Leo/Puzzle emit on the modern adapter API.
 *   B. JSON-encoded string of shape A.
 *   C. Aleo plaintext string:
 *        "{owner: aleo1…, microcredits: 5u64.private, _nonce: …group.public}"
 *
 * The previous code only handled C, regex-parsed everything, and dropped A/B
 * silently — which was the actual cause of "insufficient balance" despite a
 * wallet holding private ALEO. Now we dispatch on runtime shape.
 */
function normalizeRecord(raw: unknown, programId: string): ParsedRecord | null {
  // Shape A — structured object (canonical adapter return)
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const dataField = (r.data ?? {}) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(dataField)) {
      data[k] = typeof v === "string" ? v : String(v);
    }
    const spent = r.spent === true || r.spent === "true";
    const owner = (r.owner as string) || (dataField.owner as string) || "";
    const nonce = (r._nonce as string) || (r.nonce as string) || (dataField._nonce as string) || "";

    // The wallet's preferred input format for `executeTransaction` is the
    // Aleo plaintext record string — `{owner: aleo1….private, microcredits:
    // 5u64.private, _nonce: …group.public}`. The wallet usually exposes it
    // on `.plaintext`; if not, we reconstruct from fields (matching NullPay's
    // working pattern in usePayment.ts:535-544). Passing JSON.stringify of
    // the whole record object causes Shield to throw "Invalid transaction
    // payload" — it doesn't re-parse the adapter-layer wrapper.
    let plaintext = (r.plaintext as string) || "";
    if (!plaintext && owner && data.microcredits) {
      // Normalize microcredits to `Nu64.private` — data.microcredits may come
      // as `5000000u64`, `5000000u64.private`, or `5000000`.
      const amtMatch = String(data.microcredits).match(/^(\d+)/);
      const amt = amtMatch ? amtMatch[1] : "0";
      const microcreditsLit = `${amt}u64.private`;
      const nonceLit = nonce.includes(".") ? nonce : `${nonce}.public`;
      plaintext = `{ owner: ${owner}.private, microcredits: ${microcreditsLit}, _nonce: ${nonceLit} }`;
    }
    // Last-resort fallbacks if we can't build plaintext
    if (!plaintext) plaintext = (r.ciphertext as string) || "";

    return {
      id: (r.id as string) || nonce || "",
      programId: (r.programId as string) || programId,
      functionName: (r.function as string) || "",
      owner,
      data,
      nonce,
      ciphertext: plaintext,
      spent,
    };
  }

  // Shapes B and C require a string.
  if (typeof raw !== "string") return null;

  // Shape B — JSON-encoded record
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return normalizeRecord(parsed, programId);
    }
  } catch {
    // Not JSON — fall through.
  }

  // Shape C — Aleo plaintext
  try {
    const ownerMatch = raw.match(/owner:\s*(aleo1[a-z0-9]+)/);
    const nonceMatch = raw.match(/_nonce:\s*(\d+group\.public)/);

    const data: Record<string, string> = {};
    const fieldMatches = raw.matchAll(/(\w+):\s*([^,}]+)/g);
    for (const match of fieldMatches) {
      if (match[1] !== "owner" && match[1] !== "_nonce") {
        data[match[1]] = match[2].trim();
      }
    }

    if (!ownerMatch && Object.keys(data).length === 0) return null;

    return {
      id: nonceMatch?.[1] || Math.random().toString(36).slice(2),
      programId,
      functionName: "",
      owner: ownerMatch?.[1] || "",
      data,
      nonce: nonceMatch?.[1] || "",
      ciphertext: raw,
      spent: false, // plaintext-string shape doesn't carry a spent flag
    };
  } catch {
    return null;
  }
}

/**
 * Parse an Aleo scalar literal into a BigInt of its numeric value.
 *
 * Handles any combination of: leading digits, an integer/field/group/scalar
 * type suffix (e.g. `u64`, `i128`, `field`, `group`, `scalar`), and a
 * visibility suffix (`.private`, `.public`, `.constant`). Whitespace and
 * quotes are tolerated. Returns 0n if no digit prefix is present.
 *
 * Shield and Puzzle return plaintext records whose fields look like
 * `microcredits: 5000000u64.private`. The old version only stripped `u\d+$`
 * or `field$`, so `.private` tripped `BigInt(...)` and every record parsed
 * to 0 — causing a spurious "Insufficient balance" for any private spend.
 */
function parseMicrocredits(value: string): bigint {
  const match = value.trim().replace(/^"|"$/g, "").match(/^(\d+)/);
  if (!match) return BigInt(0);
  try {
    return BigInt(match[1]);
  } catch {
    return BigInt(0);
  }
}
