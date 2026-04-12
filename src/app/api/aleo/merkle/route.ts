import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * BHP256 Merkle tree service.
 *
 * The vendor-allowlist ZK verification in `stealthap_inv_v2::verify_vendor_allowlist`
 * hashes each tree node as `BHP256::hash_to_field(MerkleNode { left, right })`.
 * Browsers can't easily run the same BHP hash (it's inside the @provablehq/wasm
 * package and requires WASM init + bigint-safe serialization that differs
 * across bundlers), so we compute the tree here on the server and hand back
 * the root + every level. The client caches the tree and extracts a proof
 * path at invoice-creation time, then calls verify_vendor_allowlist with
 * inputs the contract's BHP hash will actually verify.
 *
 * POST body: { leaves: string[] }  — each leaf is a field-value string (no suffix)
 * Response:  { root: string, tree: string[][] }  — tree[level][index]
 *
 * Auth required — this is a computation service tied to the user's allowlist.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const leaves: unknown = body.leaves;
    if (!Array.isArray(leaves) || leaves.length === 0) {
      return NextResponse.json({ error: "leaves must be a non-empty array" }, { status: 400 });
    }
    if (leaves.some((l) => typeof l !== "string")) {
      return NextResponse.json({ error: "leaves must be string[]" }, { status: 400 });
    }

    // Depth = 8 in the contract (verify_vendor_allowlist walks 8 levels),
    // capacity = 256 leaves. Pad with zero-field so the tree always has
    // 2^8 = 256 leaves and the proof path is always 8 levels deep.
    const DEPTH = 8;
    const CAPACITY = 1 << DEPTH;
    if (leaves.length > CAPACITY) {
      return NextResponse.json(
        { error: `allowlist exceeds capacity ${CAPACITY}` },
        { status: 400 }
      );
    }
    const padded: string[] = (leaves as string[]).slice();
    while (padded.length < CAPACITY) padded.push("0");

    // Lazy-load WASM only when invoked — keeps cold start tolerable.
    const { BHP256, Field } = await import("@provablehq/sdk");

    const hasher = new BHP256();
    const toField = (s: string): unknown => {
      // Field.fromString expects `Nfield` or `N` depending on build.
      // We canonicalize to `Nfield` so every call is consistent with what
      // the Leo contract emits.
      const canonical = s.endsWith("field") ? s : `${s}field`;
      return (Field as unknown as { fromString: (v: string) => unknown }).fromString(canonical);
    };

    // Build the tree bottom-up. level[0] is the leaves, level[DEPTH] is the
    // root (single element).
    const tree: string[][] = [padded.slice()];
    let current = padded.map(toField);
    for (let d = 0; d < DEPTH; d++) {
      const next: unknown[] = [];
      const nextStrings: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = current[i + 1];
        // BHP256.hash takes Array<any>; passing [left, right] matches the
        // Leo struct MerkleNode { left, right } serialization.
        const h = (hasher as unknown as { hash: (input: unknown[]) => unknown }).hash([left, right]);
        next.push(h);
        const s = (h as { toString: () => string }).toString();
        // Trim the `field` suffix if present so stored strings are bare
        // numeric field values.
        nextStrings.push(s.replace(/field$/, ""));
      }
      tree.push(nextStrings);
      current = next;
    }

    const root = tree[tree.length - 1][0];

    console.log("[aleo/merkle] built tree", {
      leaves: leaves.length,
      padded: padded.length,
      depth: DEPTH,
      rootPrefix: root.slice(0, 16),
      ms: Date.now() - startedAt,
    });

    return NextResponse.json({ root, tree });
  } catch (err) {
    console.error("[aleo/merkle] failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "merkle tree computation failed" },
      { status: 500 }
    );
  }
}
