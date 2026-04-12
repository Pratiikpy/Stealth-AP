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
   * `requestTransaction`. Initially set from whatever the wallet returns
   * (encrypted ciphertext or plaintext); after our decrypt pass this is
   * always the Aleo plaintext string the wallet will accept back.
   */
  ciphertext: string;
  /**
   * The encrypted `record1…` blob as returned by Shield/Puzzle. Kept so we
   * can call `wallet.decrypt(recordCiphertext)` during the post-fetch decrypt
   * pass when the initial response didn't include plaintext.
   */
  recordCiphertext?: string;
  /** True when this record has already been consumed in a prior tx. */
  spent: boolean;
  /**
   * Optional microcredits value filled in after decrypt (for credits records
   * only). Not set for non-credits program records.
   */
  microcredits?: bigint;
}

export interface CreditsRecord extends ParsedRecord {
  microcredits: bigint;
}

// Local cache to avoid re-scanning
let recordCache: Map<string, ParsedRecord[]> = new Map();
let lastScanTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Tentatively-spent record nonces. When we submit a tx that consumes a
 * record, we add the record's nonce here so the next `findRecordForAmount`
 * call skips it — even though the wallet still reports `spent: false` until
 * the tx confirms on-chain (~2 min). Without this, users who click Pay twice
 * in quick succession get a silent double-spend rejection.
 *
 * Entries expire after 5 minutes (chain will have confirmed by then, and
 * the wallet's authoritative spent flag takes over).
 */
const tentativelySpent = new Map<string, number>();
const TENTATIVE_TTL_MS = 5 * 60_000;

function pruneTentative() {
  const now = Date.now();
  for (const [nonce, timestamp] of tentativelySpent) {
    if (now - timestamp > TENTATIVE_TTL_MS) tentativelySpent.delete(nonce);
  }
}

export function markTentativelySpent(nonces: string[]) {
  pruneTentative();
  const now = Date.now();
  for (const n of nonces) {
    if (n) tentativelySpent.set(n, now);
  }
}

/**
 * Remove nonces from the tentative-spent set. Call this when a tx we marked
 * ends up failing (wallet rejection, network error, on-chain rejection) — the
 * records were NOT consumed, so future retries should be able to pick them
 * again. Without this, a user whose first pay attempt failed would be
 * locked out of their own records for 5 minutes.
 */
export function unmarkTentativelySpent(nonces: string[]) {
  for (const n of nonces) {
    if (n) tentativelySpent.delete(n);
  }
}

/**
 * Clear ALL entries. Call after invalidateRecordCache when we know the chain
 * has just produced new records (post-join, post-shield) — the old entries
 * we were tracking are either truly spent (on-chain) or completely obsolete,
 * and leaving them around poisons the recursive auto-retry path that runs
 * immediately after cache invalidation.
 */
export function clearTentativelySpent() {
  tentativelySpent.clear();
}

export function isTentativelySpent(nonce: string): boolean {
  pruneTentative();
  return !!nonce && tentativelySpent.has(nonce);
}

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
    // Full record JSON (including the encrypted recordCiphertext) is helpful
    // while debugging a wallet's return shape, but it leaks private-balance
    // metadata into the production browser console. Gate it behind dev.
    const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    if (isDev && rawRecords.length > 0) {
      const sample = rawRecords[0];
      console.log(`[records] first record type: ${typeof sample}`, sample);
      try {
        console.log(`[records] first record JSON: ${JSON.stringify(sample, null, 2).slice(0, 800)}`);
      } catch {
        console.log("[records] first record could not be stringified (cyclic?)");
      }
    }

    const parsed = rawRecords
      .map((raw) => normalizeRecord(raw, programId))
      .filter((r): r is ParsedRecord => r !== null);

    // Filter spent records first — no point decrypting something that's
    // already been consumed on-chain.
    const unspent = parsed.filter((r) => !r.spent);
    console.log(`[records] parsed ${parsed.length} record(s), ${unspent.length} unspent`);

    // Shield/Puzzle under the ON_CHAIN_HISTORY permission return records as
    // encrypted ciphertexts (field `recordCiphertext`). They do NOT include
    // a `plaintext` field in the response, so we can't read microcredits.
    // The wallet exposes a `decrypt(ciphertext)` method — call it per record
    // so the spend logic sees real balances. Matches NullPay's fallback at
    // usePayment.ts:472-479.
    const decryptFn = wallet.decrypt as ((c: string) => Promise<string>) | undefined;
    if (decryptFn) {
      const needDecrypt = unspent.filter((r) => r.microcredits === undefined || r.microcredits === BigInt(0));
      if (needDecrypt.length > 0) {
        console.log(`[records] decrypting ${needDecrypt.length} record(s) via ${walletLabel}.decrypt`);
        await Promise.all(
          needDecrypt.map(async (r) => {
            const cipher = r.recordCiphertext;
            if (!cipher) return;
            try {
              const plaintext = await decryptFn.call(wallet, cipher);
              if (plaintext && typeof plaintext === "string") {
                r.ciphertext = plaintext; // this field is what we pass to executeTransaction
                const m = plaintext.match(/microcredits:\s*([\d_]+)u64/);
                if (m?.[1]) {
                  try {
                    r.microcredits = BigInt(m[1].replace(/_/g, ""));
                  } catch { /* parse error, leave as-is */ }
                }
                // Also extract the nonce if not already set
                if (!r.nonce) {
                  const nonceMatch = plaintext.match(/_nonce:\s*(\d+)group/);
                  if (nonceMatch?.[1]) r.nonce = `${nonceMatch[1]}group.public`;
                }
              }
            } catch (err) {
              console.warn("[records] decrypt failed for one record:", err);
            }
          }),
        );
      }
    }

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
 *
 * Reads microcredits from whichever field the wallet actually populated:
 *   - `data.microcredits` (Shield's pre-includePlaintext shape)
 *   - `data.amount` (older adapter variants)
 *   - regex on `ciphertext` / plaintext (Shield's post-includePlaintext shape,
 *     matches NullPay's usePayment.ts:135-150 getMicrocredits fallback)
 *
 * The final fallback is critical: after we started calling requestRecords
 * with includePlaintext=true, Shield returns records with the plaintext
 * string but sometimes no `data` wrapper — reading only `data.microcredits`
 * made every record parse to 0n, which looked like "no spendable private
 * balance" and falsely routed users into the shield branch.
 */
export async function getCreditsRecords(): Promise<CreditsRecord[]> {
  const records = await getRecords("credits.aleo");

  const parsed = records.map((r) => {
    // getRecords's decrypt pass may have already populated microcredits from
    // the decrypted plaintext. Trust that if present; only fall back to our
    // own extraction when it's still zero/missing.
    let microcredits = r.microcredits ?? BigInt(0);
    if (microcredits === BigInt(0)) {
      microcredits = parseMicrocredits(r.data.microcredits || r.data.amount || "0");
    }
    if (microcredits === BigInt(0) && r.ciphertext) {
      const match = r.ciphertext.match(/microcredits:\s*([\d_]+)u64/);
      if (match?.[1]) {
        try {
          microcredits = BigInt(match[1].replace(/_/g, ""));
        } catch {
          microcredits = BigInt(0);
        }
      }
    }
    return { ...r, microcredits };
  });

  const preview = parsed.map((r) => `${r.microcredits.toString()}u`).slice(0, 10);
  console.log(`[records] credits balances (first 10): [${preview.join(", ")}] — total ${parsed.length} records`);

  return parsed;
}

/**
 * Find the best credits record for a target payment amount.
 * Returns the smallest record that covers the amount (minimizes change).
 */
export function findRecordForAmount(
  records: CreditsRecord[],
  targetAmount: bigint
): CreditsRecord | null {
  const sufficient = records
    .filter((r) => r.microcredits >= targetAmount)
    // Skip records we submitted in the last ~5 min — the wallet still sees
    // them as unspent until chain confirmation, and spending twice on-chain
    // fails.
    .filter((r) => !isTentativelySpent(r.nonce))
    .sort((a, b) => {
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
  // Also clear tentatively-spent entries — whenever we explicitly invalidate
  // (after a successful tx submission / post-confirmation), we want the next
  // scan to see the chain's authoritative state. Leftover tentative marks
  // from a PRIOR attempt would incorrectly filter out records that the chain
  // has since produced (e.g., the output of a confirmed join).
  tentativelySpent.clear();
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

    // Shield/Puzzle return the encrypted form on `recordCiphertext`; older
    // adapters use `ciphertext`. Keep whichever exists so the decrypt pass
    // in getRecords() can resolve it.
    const recordCiphertext =
      (r.recordCiphertext as string) || (r.ciphertext as string) || "";

    // Preferred: plaintext string the wallet returned directly.
    // Fallback: reconstruct from fields.
    // Last resort: the encrypted ciphertext (the decrypt pass will overwrite
    // this once it has plaintext).
    let plaintext = (r.plaintext as string) || "";
    if (!plaintext && owner && data.microcredits) {
      const amtMatch = String(data.microcredits).match(/^([\d_]+)/);
      const amt = amtMatch ? amtMatch[1].replace(/_/g, "") : "0";
      const nonceLit = nonce.includes(".") ? nonce : `${nonce}.public`;
      plaintext = `{ owner: ${owner}.private, microcredits: ${amt}u64.private, _nonce: ${nonceLit} }`;
    }
    if (!plaintext) plaintext = recordCiphertext;

    return {
      id: (r.id as string) || (r.commitment as string) || nonce || "",
      programId: (r.programId as string) || (r.programName as string) || programId,
      functionName: (r.function as string) || (r.functionName as string) || "",
      owner,
      data,
      nonce,
      ciphertext: plaintext,
      recordCiphertext,
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
 * Accepts any combination of:
 *   - leading digits, OPTIONALLY WITH UNDERSCORE SEPARATORS (e.g. `12_000_000`)
 *   - type suffix (`u64`, `i128`, `field`, `group`, `scalar`)
 *   - visibility suffix (`.private`, `.public`, `.constant`)
 *   - surrounding whitespace / quotes
 *
 * Aleo plaintext syntax permits underscores as digit separators — Shield and
 * Puzzle both render records this way (e.g. `microcredits: 12_000_000u64
 * .private`). An earlier version of this parser used `\d+` which stopped at
 * the first `_` and read `12_000_000` as `12`, causing every large record
 * to look like 12 microcredits and the flow to fall into the shield branch
 * despite ample private balance. Now uses `[\d_]+` and strips separators.
 */
function parseMicrocredits(value: string): bigint {
  const match = value.trim().replace(/^"|"$/g, "").match(/^([\d_]+)/);
  if (!match) return BigInt(0);
  const cleaned = match[1].replace(/_/g, "");
  if (!cleaned) return BigInt(0);
  try {
    return BigInt(cleaned);
  } catch {
    return BigInt(0);
  }
}
