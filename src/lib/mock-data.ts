import type {
  Invoice, Vendor, Payment, Approval, AuditEntry, TreasuryStats,
} from "./types";

export const stats: TreasuryStats = {
  totalBalance: 2_847_500_000_000,
  totalPayable: 423_180_000_000,
  pendingApprovals: 5,
  settledThisMonth: 1_284_320_000_000,
  activeVendors: 12,
};

export const vendors: Vendor[] = [
  { id: "v-001", name: "Aleo Infrastructure Co.", alias: "aleo-infra", address: "aleo1qnr4dkkvkgfqph0azaykv30wqfgcqkv86rhm87un9tsp9lk5ursg6szjc", category: "Infrastructure", totalPaid: 845_000_000_000, invoiceCount: 14, lastPayment: "2026-03-28" },
  { id: "v-002", name: "ZK Auditors Ltd.", alias: "zk-audit", address: "aleo1wyvu96dvv0auq9e4qme54kjuhzglyfcf576h0g3nrrmrmr0505pq9shrp4", category: "Security", totalPaid: 320_000_000_000, invoiceCount: 6, lastPayment: "2026-03-15" },
  { id: "v-003", name: "Privacy Labs Inc.", alias: "priv-labs", address: "aleo1rhgdu77hzqd7nakhl4trrkpmt4t26q42cgs5lg3cg5vy0kfpe5pqc3a0u6", category: "Research", totalPaid: 198_750_000_000, invoiceCount: 8, lastPayment: "2026-04-01" },
  { id: "v-004", name: "Node Operators Guild", alias: "node-ops", address: "aleo1sky4cmmrtzlw032yjahq3krz5nyx7dpsme5xsnjtqd9jjhv58u9s7pxzrz", category: "Operations", totalPaid: 567_200_000_000, invoiceCount: 22, lastPayment: "2026-04-03" },
  { id: "v-005", name: "Cryptographic Solutions AG", alias: "crypto-sol", address: "aleo1p39y04ga5lejjpymrmh42v5keas2e5wlnmcaydpnkv3shm5yn5fqca68y4", category: "Engineering", totalPaid: 412_000_000_000, invoiceCount: 10, lastPayment: "2026-03-22" },
];

export const invoices: Invoice[] = [
  {
    id: "INV-2026-0042", vendorId: "v-001", vendorName: "Aleo Infrastructure Co.",
    amount: 125_000_000_000, token: "ALEO", status: "pending",
    dueDate: "2026-04-15", createdAt: "2026-04-01",
    description: "Q2 node hosting and maintenance",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-04-02" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "pending" },
    ],
  },
  {
    id: "INV-2026-0041", vendorId: "v-002", vendorName: "ZK Auditors Ltd.",
    amount: 85_000_000_000, token: "ALEO", status: "approved",
    dueDate: "2026-04-10", createdAt: "2026-03-28",
    description: "Smart contract audit - batch processor v2",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-03-29" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "approved", timestamp: "2026-03-30" },
    ],
    txHash: "at1skyward8f3gj2r90qkl28fm0d4wjzh35r96x",
  },
  {
    id: "INV-2026-0040", vendorId: "v-003", vendorName: "Privacy Labs Inc.",
    amount: 42_500_000_000, token: "ALEO", status: "paid",
    dueDate: "2026-04-05", createdAt: "2026-03-25",
    description: "ZK-SNARK research deliverable - phase 3",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-03-26" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "approved", timestamp: "2026-03-27" },
    ],
    txHash: "at1priv4cy7h2kj5mn3bq9x0fwt6d8srlz2y4c",
  },
  {
    id: "INV-2026-0039", vendorId: "v-004", vendorName: "Node Operators Guild",
    amount: 67_800_000_000, token: "ALEO", status: "pending",
    dueDate: "2026-04-12", createdAt: "2026-03-30",
    description: "March validator operations and uptime SLA",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "pending" },
    ],
  },
  {
    id: "INV-2026-0038", vendorId: "v-005", vendorName: "Cryptographic Solutions AG",
    amount: 95_200_000_000, token: "ALEO", status: "rejected",
    dueDate: "2026-04-08", createdAt: "2026-03-22",
    description: "Encryption module licensing - annual renewal",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-03-23" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "rejected", timestamp: "2026-03-24", note: "Duplicate of INV-2026-0031" },
    ],
  },
  {
    id: "INV-2026-0037", vendorId: "v-001", vendorName: "Aleo Infrastructure Co.",
    amount: 48_000_000_000, token: "ALEO", status: "settled",
    dueDate: "2026-03-25", createdAt: "2026-03-10",
    description: "Emergency network scaling - February incident",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-03-11" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "approved", timestamp: "2026-03-11" },
    ],
    txHash: "at1infra9d2kp7s4nx5jq1m8ycz0w3hf6btge",
  },
  {
    id: "INV-2026-0036", vendorId: "v-003", vendorName: "Privacy Labs Inc.",
    amount: 31_250_000_000, token: "ALEO", status: "draft",
    dueDate: "2026-04-20", createdAt: "2026-04-05",
    description: "Homomorphic encryption consulting - April",
    approvalChain: [],
  },
  {
    id: "INV-2026-0035", vendorId: "v-004", vendorName: "Node Operators Guild",
    amount: 72_000_000_000, token: "ALEO", status: "pending",
    dueDate: "2026-04-18", createdAt: "2026-04-03",
    description: "Q2 validator delegation rewards distribution",
    approvalChain: [
      { approver: "Sarah Chen", role: "Finance Lead", status: "approved", timestamp: "2026-04-04" },
      { approver: "Marcus Webb", role: "Treasury Director", status: "pending" },
    ],
  },
];

export const payments: Payment[] = [
  { id: "PAY-0021", invoiceId: "INV-2026-0040", vendorName: "Privacy Labs Inc.", amount: 42_500_000_000, token: "ALEO", status: "settled", initiatedAt: "2026-03-28", settledAt: "2026-03-28", txHash: "at1priv4cy7h2kj5mn3bq9x0fwt6d8srlz2y4c", zkProof: "proof1qyp5...k3rf" },
  { id: "PAY-0020", invoiceId: "INV-2026-0037", vendorName: "Aleo Infrastructure Co.", amount: 48_000_000_000, token: "ALEO", status: "settled", initiatedAt: "2026-03-12", settledAt: "2026-03-12", txHash: "at1infra9d2kp7s4nx5jq1m8ycz0w3hf6btge", zkProof: "proof1abc7...x9mz" },
  { id: "PAY-0022", invoiceId: "INV-2026-0041", vendorName: "ZK Auditors Ltd.", amount: 85_000_000_000, token: "ALEO", status: "queued", initiatedAt: "2026-04-05" },
  { id: "PAY-0023", invoiceId: "INV-2026-0042", vendorName: "Aleo Infrastructure Co.", amount: 125_000_000_000, token: "ALEO", status: "processing", initiatedAt: "2026-04-06" },
];

export const approvals: Approval[] = [
  { id: "APR-0015", invoiceId: "INV-2026-0042", vendorName: "Aleo Infrastructure Co.", amount: 125_000_000_000, token: "ALEO", status: "pending", requestedBy: "Sarah Chen", requestedAt: "2026-04-02", description: "Q2 node hosting and maintenance" },
  { id: "APR-0014", invoiceId: "INV-2026-0039", vendorName: "Node Operators Guild", amount: 67_800_000_000, token: "ALEO", status: "pending", requestedBy: "James Liu", requestedAt: "2026-03-31", description: "March validator operations and uptime SLA" },
  { id: "APR-0013", invoiceId: "INV-2026-0035", vendorName: "Node Operators Guild", amount: 72_000_000_000, token: "ALEO", status: "pending", requestedBy: "Sarah Chen", requestedAt: "2026-04-04", description: "Q2 validator delegation rewards distribution" },
  { id: "APR-0012", invoiceId: "INV-2026-0041", vendorName: "ZK Auditors Ltd.", amount: 85_000_000_000, token: "ALEO", status: "approved", requestedBy: "Sarah Chen", requestedAt: "2026-03-29", description: "Smart contract audit - batch processor v2" },
  { id: "APR-0011", invoiceId: "INV-2026-0038", vendorName: "Cryptographic Solutions AG", amount: 95_200_000_000, token: "ALEO", status: "rejected", requestedBy: "James Liu", requestedAt: "2026-03-23", description: "Encryption module licensing - annual renewal" },
];

export const auditLog: AuditEntry[] = [
  { id: "AUD-0050", action: "invoice.created", actor: "Sarah Chen", target: "INV-2026-0042", timestamp: "2026-04-01T09:14:00Z", details: "Created invoice for Aleo Infrastructure Co." },
  { id: "AUD-0049", action: "approval.approved", actor: "Sarah Chen", target: "INV-2026-0042", timestamp: "2026-04-02T11:30:00Z", details: "Approved invoice INV-2026-0042 (step 1/2)" },
  { id: "AUD-0048", action: "payment.initiated", actor: "Marcus Webb", target: "PAY-0022", timestamp: "2026-04-05T14:00:00Z", details: "Initiated payment for ZK Auditors Ltd.", txHash: "at1skyward8f3gj2r90qkl28fm0d4wjzh35r96x" },
  { id: "AUD-0047", action: "approval.rejected", actor: "Marcus Webb", target: "INV-2026-0038", timestamp: "2026-03-24T16:45:00Z", details: "Rejected invoice: Duplicate of INV-2026-0031" },
  { id: "AUD-0046", action: "payment.settled", actor: "System", target: "PAY-0021", timestamp: "2026-03-28T08:22:00Z", details: "Payment settled on-chain with ZK proof", txHash: "at1priv4cy7h2kj5mn3bq9x0fwt6d8srlz2y4c" },
  { id: "AUD-0045", action: "vendor.created", actor: "James Liu", target: "v-005", timestamp: "2026-03-20T10:00:00Z", details: "Added vendor Cryptographic Solutions AG" },
  { id: "AUD-0044", action: "invoice.created", actor: "James Liu", target: "INV-2026-0036", timestamp: "2026-04-05T15:30:00Z", details: "Created draft invoice for Privacy Labs Inc." },
  { id: "AUD-0043", action: "payment.settled", actor: "System", target: "PAY-0020", timestamp: "2026-03-12T12:15:00Z", details: "Emergency payment settled for Aleo Infrastructure Co.", txHash: "at1infra9d2kp7s4nx5jq1m8ycz0w3hf6btge" },
];
