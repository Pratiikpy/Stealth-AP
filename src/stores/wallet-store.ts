import { create } from "zustand";

type TransactionStatus = "idle" | "signing" | "proving" | "broadcasting" | "confirming" | "confirmed" | "failed";

interface WalletState {
  address: string | null;
  connected: boolean;
  walletName: string | null;
  balance: {
    aleo: number;
    usdcx: number;
    usad: number;
  };
  transaction: {
    status: TransactionStatus;
    hash: string | null;
    error: string | null;
    progress: number;
    message: string;
  };
  setConnected: (address: string, walletName: string) => void;
  setDisconnected: () => void;
  setBalance: (balance: Partial<WalletState["balance"]>) => void;
  setTransactionStatus: (
    status: TransactionStatus,
    extra?: { hash?: string; error?: string; progress?: number; message?: string }
  ) => void;
  resetTransaction: () => void;
}

const initialTransaction = {
  status: "idle" as TransactionStatus,
  hash: null,
  error: null,
  progress: 0,
  message: "",
};

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  connected: false,
  walletName: null,
  balance: { aleo: 0, usdcx: 0, usad: 0 },
  transaction: initialTransaction,
  setConnected: (address, walletName) =>
    set({ address, connected: true, walletName }),
  setDisconnected: () =>
    set({ address: null, connected: false, walletName: null }),
  setBalance: (balance) =>
    set((s) => ({ balance: { ...s.balance, ...balance } })),
  setTransactionStatus: (status, extra = {}) =>
    set((s) => ({
      transaction: {
        ...s.transaction,
        status,
        ...extra,
      },
    })),
  resetTransaction: () => set({ transaction: initialTransaction }),
}));
