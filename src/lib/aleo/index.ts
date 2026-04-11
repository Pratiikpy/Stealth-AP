export {
  getProgram,
  getMappingValue,
  getTransaction,
  getLatestBlockHeight,
  ALEO_API_URL,
  NETWORK,
} from "./client";

export {
  detectAvailableWallets,
  WALLET_INFO,
  type WalletName,
  type WalletAdapter,
  type TransactionParams,
} from "./wallet-adapter";

export {
  executeTransaction,
  executeViaWallet,
  executeViaDPS,
  isDPSAvailable,
  waitForConfirmation,
  type TransactionRequest,
  type TransactionResult,
} from "./proving";

export {
  getRecords,
  getCreditsRecords,
  findRecordForAmount,
  findRecordsForAmount,
  getTotalBalance,
  invalidateRecordCache,
  type ParsedRecord,
  type CreditsRecord,
} from "./records";
