import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 min timeout for proving

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { programId, functionName, inputs, privateKey, fee } = body;

    if (!programId || !functionName || !inputs || !privateKey) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Dynamic import — SDK loads server-side (Node.js, much faster than browser WASM)
    const { ProgramManager, AleoKeyProvider, AleoNetworkClient, NetworkRecordProvider, Account } =
      await import("@provablehq/sdk");

    const account = new Account({ privateKey });
    const apiUrl = process.env.NEXT_PUBLIC_ALEO_API_URL || "https://api.explorer.provable.com/v1";

    const networkClient = new AleoNetworkClient(apiUrl);
    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache(true);
    const recordProvider = new NetworkRecordProvider(account, networkClient);

    const programManager = new ProgramManager(apiUrl, keyProvider, recordProvider);
    programManager.setAccount(account);

    const txId = await programManager.execute({
      programName: programId,
      functionName: functionName,
      inputs: inputs,
      priorityFee: fee ?? 100000,
      privateFee: false,
    });

    return NextResponse.json({
      transactionId: typeof txId === "string" ? txId : null,
      status: "submitted",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed", status: "failed" },
      { status: 500 }
    );
  }
}
