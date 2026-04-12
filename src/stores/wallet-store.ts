import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type TransactionStatus = "idle" | "signing" | "proving" | "broadcasting" | "confirming" | "confirmed" | "failed";

interface WalletState {
  address: string | null;
  connected: boolean;
  walletName: string | null;
  /** Burner private key. Persisted to sessionStorage (wiped on tab close). */
  privateKey: string | null;
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
  setBurnerConnected: (address: string, privateKey: string) => void;
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

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      connected: false,
      walletName: null,
      privateKey: null,
      balance: { aleo: 0, usdcx: 0, usad: 0 },
      transaction: initialTransaction,
      setConnected: (address, walletName) =>
        set({ address, connected: true, walletName, privateKey: null }),
      setBurnerConnected: (address, privateKey) =>
        set({ address, connected: true, walletName: "Burner Key", privateKey }),
      setDisconnected: () =>
        set({ address: null, connected: false, walletName: null, privateKey: null, balance: { aleo: 0, usdcx: 0, usad: 0 } }),
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
    }),
    {
      name: "stealthap-wallet",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        }
      ),
      partialize: (state) => ({
        address: state.address,
        connected: state.connected,
        walletName: state.walletName,
        balance: state.balance,
        // Testnet burner key persists to sessionStorage (wiped on tab close).
        // Required so the burner flow survives navigation — without it, every
        // route change silently downgrades the wallet to "extension" mode.
        privateKey: state.privateKey,
      }),
    }
  )
);
