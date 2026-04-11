export type InvoiceStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "settled";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type PaymentStatus = "queued" | "processing" | "settled" | "failed";

export interface Vendor {
  id: string;
  name: string;
  alias: string;
  address: string;
  category: string;
  totalPaid: number;
  invoiceCount: number;
  lastPayment: string;
}

export interface ApprovalStep {
  approver: string;
  role: string;
  status: ApprovalStatus;
  timestamp?: string;
  note?: string;
}

export interface Invoice {
  id: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  token: string;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
  description: string;
  approvalChain: ApprovalStep[];
  txHash?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  vendorName: string;
  amount: number;
  token: string;
  status: PaymentStatus;
  initiatedAt: string;
  settledAt?: string;
  txHash?: string;
  zkProof?: string;
}

export interface Approval {
  id: string;
  invoiceId: string;
  vendorName: string;
  amount: number;
  token: string;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: string;
  description: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  details: string;
  txHash?: string;
}

export interface TreasuryStats {
  totalBalance: number;
  totalPayable: number;
  pendingApprovals: number;
  settledThisMonth: number;
  activeVendors: number;
}
