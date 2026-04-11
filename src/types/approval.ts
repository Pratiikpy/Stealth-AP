export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  invoice_id: string;
  approver_id: string;
  approver_name: string | null;
  status: ApprovalStatus;
  comments: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface ApprovalRule {
  id: string;
  company_id: string;
  name: string;
  condition_type: "amount" | "vendor" | "category";
  operator: "greater_than" | "less_than" | "equals" | "between";
  value: string;
  value_max: string | null;
  approvers: string[];
  approval_type: "any" | "all";
  timeout_hours: number;
  escalation_user_id: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
}
