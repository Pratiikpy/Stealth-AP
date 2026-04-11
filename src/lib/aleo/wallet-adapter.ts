/**
 * Aleo Wallet Adapter
 * Unified interface for Shield, Leo, Puzzle, and Fox wallets
 */

export type WalletName = "shield" | "leo" | "puzzle" | "fox";

export interface WalletAdapter {
  name: WalletName;
  displayName: string;
  connected: boolean;
  address: string | null;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  requestTransaction: (params: TransactionParams) => Promise<string>;
}

export interface TransactionParams {
  programId: string;
  functionName: string;
  inputs: string[];
  fee: number;
}

/**
 * Detect which wallets are available in the browser
 */
export function detectAvailableWallets(): WalletName[] {
  const wallets: WalletName[] = [];

  if (typeof window === "undefined") return wallets;

  // Check for wallet extensions in window object
  const w = window as unknown as Record<string, unknown>;
  if (w.leoWallet) wallets.push("leo");
  if (w.puzzle) wallets.push("puzzle");
  if (w.foxwallet) wallets.push("fox");
  if (w.shieldWallet) wallets.push("shield");

  return wallets;
}

/**
 * Wallet display info
 */
export const WALLET_INFO: Record<
  WalletName,
  { displayName: string; installUrl: string }
> = {
  shield: {
    displayName: "Shield Wallet",
    installUrl: "https://shieldwallet.io",
  },
  leo: {
    displayName: "Leo Wallet",
    installUrl: "https://leo.app",
  },
  puzzle: {
    displayName: "Puzzle Wallet",
    installUrl: "https://puzzle.online",
  },
  fox: {
    displayName: "Fox Wallet",
    installUrl: "https://foxwallet.com",
  },
};
