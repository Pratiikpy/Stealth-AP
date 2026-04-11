// Re-export canonical frontend types from lib/types.
// These are what page components use (camelCase fields).
export type {
  Invoice,
  InvoiceStatus,
  Vendor,
  Payment,
  PaymentStatus,
  Approval,
  ApprovalStatus,
  ApprovalStep,
  AuditEntry,
  TreasuryStats,
} from "@/lib/types";

// DB-schema types (snake_case fields) — used by detail components, stores,
// and the API/Supabase layer that works with raw database rows.
export type { Invoice as InvoiceRow, InvoiceStatus as InvoiceStatusDb } from "./invoice";
export type { Vendor as VendorRow } from "./vendor";
export type { Payment as PaymentRow, PaymentStatus as PaymentStatusDb } from "./payment";
export type { Approval as ApprovalRow, ApprovalStatus as ApprovalStatusDb } from "./approval";

// Types unique to src/types/ (no conflict with lib/types)
export type { InvoiceExtraction, LineItem, CurrencyFlag } from "./invoice";
export type { VendorStatus } from "./vendor";
export type { PaymentMethod, BatchPayment } from "./payment";
export type { ApprovalRule } from "./approval";

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "admin" | "approver" | "clerk" | "viewer";
  company_id: string;
  wallet_address: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  settings: CompanySettings;
  created_at: string;
}

export interface CompanySettings {
  default_currency: "ALEO" | "USDCx" | "USAD";
  auto_approve_threshold_micro: number;
  timezone: string;
  fiscal_year_start_month: number;
}

export interface StatCard {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    positive: boolean;
  };
}
