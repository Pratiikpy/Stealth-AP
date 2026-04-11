/**
 * Aleo Network Client
 * Handles all communication with the Aleo network via Provable API
 */

const ALEO_API_URL =
  process.env.NEXT_PUBLIC_ALEO_API_URL ||
  "https://api.explorer.provable.com/v1";

const NETWORK = process.env.NEXT_PUBLIC_ALEO_NETWORK || "testnet";

export async function getProgram(programId: string): Promise<string> {
  const res = await fetch(
    `${ALEO_API_URL}/${NETWORK}/program/${programId}`
  );
  if (!res.ok) throw new Error(`Failed to fetch program: ${programId}`);
  return res.text();
}

export async function getMappingValue(
  programId: string,
  mappingName: string,
  key: string
): Promise<string | null> {
  const res = await fetch(
    `${ALEO_API_URL}/${NETWORK}/program/${programId}/mapping/${mappingName}/${key}`
  );
  if (!res.ok) return null;
  return res.text();
}

export async function getTransaction(txId: string) {
  const res = await fetch(
    `${ALEO_API_URL}/${NETWORK}/transaction/${txId}`
  );
  if (!res.ok) throw new Error(`Transaction not found: ${txId}`);
  return res.json();
}

export async function getLatestBlockHeight(): Promise<number> {
  const res = await fetch(
    `${ALEO_API_URL}/${NETWORK}/latest/height`
  );
  if (!res.ok) throw new Error("Failed to fetch block height");
  const text = await res.text();
  return parseInt(text, 10);
}

export { ALEO_API_URL, NETWORK };
