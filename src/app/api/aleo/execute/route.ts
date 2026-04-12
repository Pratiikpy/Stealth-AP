import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let programId = "", functionName = "";
  try {
    // Auth guard — this endpoint accepts an Aleo private key in the body to
    // generate a proof server-side for burner-wallet flows. Without auth any
    // caller could hit it and have us broadcast on behalf of an arbitrary
    // key they submit. Require a logged-in Supabase user.
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    programId = body.programId;
    functionName = body.functionName;
    const { inputs, privateKey } = body;

    if (!programId || !functionName || !inputs || !privateKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Use Leo CLI locally (fast, uses pre-compiled keys). On Vercel, fall back
    // to the SDK path. The CLI branch now passes PRIVATE_KEY via child-process
    // env rather than writing a .env, so it's safe to leave gated here.
    const isLocal = process.env.NODE_ENV === "development" || process.env.USE_LEO_CLI === "true";
    const response = isLocal
      ? await executeViaLeoCli(programId, functionName, inputs, privateKey)
      : await executeViaSdkServer(programId, functionName, inputs, privateKey);

    console.log("[aleo/execute]", { programId, functionName, ms: Date.now() - startedAt, status: response.status });
    return response;
  } catch (err) {
    // Never return raw error.message — Leo CLI / SDK errors can include
    // private key fragments, command-line arguments, and internal paths.
    // Log fully server-side, return a generic message to the client.
    console.error("[aleo/execute] unhandled", {
      programId,
      functionName,
      ms: Date.now() - startedAt,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Transaction execution failed. Check server logs for details.", status: "failed" },
      { status: 500 }
    );
  }
}

async function executeViaLeoCli(
  programId: string, functionName: string, inputs: string[], privateKey: string
) {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const path = await import("path");
  const execFileAsync = promisify(execFile);

  const endpoint = "https://api.explorer.provable.com/v1";

  const programDirMap: Record<string, string> = {
    "stealthap_inv_v2.aleo": "stealthap_inv_v2",
    "stealthap_pay_v2.aleo": "stealthap_pay_v2",
    "stealthap_wf_v2.aleo": "stealthap_wf_v2",
    "stealthap_aud_v2.aleo": "stealthap_aud_v2",
    "stealthap_bat_v2.aleo": "stealthap_bat_v2",
  };

  const dir = programDirMap[programId];
  if (!dir) {
    return NextResponse.json({ error: `Unknown program: ${programId}` }, { status: 400 });
  }

  const contractDir = path.join(process.cwd(), "contracts", dir);

  // Pass the private key via child-process env instead of writing .env to disk.
  // Leo CLI reads PRIVATE_KEY/ENDPOINT/NETWORK from process env as a fallback,
  // which works on both local dev and environments with ephemeral filesystems.
  const args = [
    "execute",
    functionName,
    ...inputs,
    "--network", "testnet",
    "--endpoint", endpoint,
    "--broadcast",
    "-y",
  ];

  try {
    const { stdout, stderr } = await execFileAsync("leo", args, {
      cwd: contractDir,
      timeout: 120000,
      env: {
        ...process.env,
        PRIVATE_KEY: privateKey,
        ENDPOINT: endpoint,
        NETWORK: "testnet",
      },
    });

    const output = stdout + stderr;
    const txMatch = output.match(/transaction ID: '(at1[a-z0-9]+)'/);
    const confirmed = output.includes("Execution confirmed") || output.includes("Transaction accepted");

    if (txMatch) {
      return NextResponse.json({
        transactionId: txMatch[1],
        status: confirmed ? "confirmed" : "submitted",
      });
    }

    if (output.includes("Error")) {
      // Log the Leo CLI stderr/stdout tail server-side for debugging, but
      // NEVER return it to the client — the output can contain fragments
      // of the PRIVATE_KEY env var, internal paths, and command-line args.
      console.error("[aleo/execute] leo cli reported error", { programId, functionName, tail: output.slice(-500) });
      return NextResponse.json(
        { error: "Leo execution failed. Check server logs.", status: "failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ transactionId: null, status: "submitted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[aleo/execute] leo cli failed", { programId, functionName, message });
    // Same rationale — caught exception may wrap the child process stderr
    // including env vars. Return generic error only.
    return NextResponse.json(
      { error: "Leo CLI execution failed. Check server logs.", status: "failed" },
      { status: 500 }
    );
  }
}

async function executeViaSdkServer(
  programId: string, functionName: string, inputs: string[], privateKey: string
) {
  const { ProgramManager, AleoKeyProvider, AleoNetworkClient, NetworkRecordProvider, Account } =
    await import("@provablehq/sdk");

  const account = new Account({ privateKey });
  const apiUrl = process.env.NEXT_PUBLIC_ALEO_API_URL || "https://api.explorer.provable.com/v1";

  const networkClient = new AleoNetworkClient(apiUrl);
  const keyProvider = new AleoKeyProvider();
  keyProvider.useCache(true);
  const recordProvider = new NetworkRecordProvider(account, networkClient);

  // Burner flow cannot scan records from the browser, so the client passes a
  // sentinel (__AUTO_RECORD__) wherever a credits.aleo/credits record is needed.
  // Resolve it here via NetworkRecordProvider. The required microcredits amount
  // is read from a later u64 input (the `amount` field of the payment call).
  const resolvedInputs = [...inputs];
  const sentinelIdx = resolvedInputs.findIndex((v) => v === "__AUTO_RECORD__");
  if (sentinelIdx !== -1) {
    const amountInput = resolvedInputs.find((v) => typeof v === "string" && /^\d+u64$/.test(v));
    if (!amountInput) {
      return NextResponse.json(
        { error: "Auto-record sentinel used but no u64 amount found in inputs.", status: "failed" },
        { status: 400 }
      );
    }
    // SDK signature: findCreditsRecord(microcredits: number, { unspent, nonces }).
    // Takes a plain number (not BigInt) — Aleo testnet caps practical spends
    // well under Number.MAX_SAFE_INTEGER, so the conversion is lossless here.
    const microcredits = Number(amountInput.replace(/u64$/, ""));

    let record;
    try {
      record = await recordProvider.findCreditsRecord(microcredits, {
        unspent: true,
        nonces: [],
      });
    } catch (err) {
      console.error("[aleo/execute] findCreditsRecord threw", err);
      record = null;
    }
    if (!record) {
      return NextResponse.json(
        {
          error: "No spendable private credits record found. Shield public balance first (transfer_public_to_private), wait ~2 min, then retry.",
          status: "failed",
        },
        { status: 400 }
      );
    }
    resolvedInputs[sentinelIdx] = record.toString();
  }

  const programManager = new ProgramManager(apiUrl, keyProvider, recordProvider);
  programManager.setAccount(account);

  const txId = await programManager.execute({
    programName: programId,
    functionName: functionName,
    inputs: resolvedInputs,
    priorityFee: 100000,
    privateFee: false,
  });

  return NextResponse.json({
    transactionId: typeof txId === "string" ? txId : null,
    status: "submitted",
  });
}
