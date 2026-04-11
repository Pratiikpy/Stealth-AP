-- =============================================
-- STEALTHAP — Supabase Migration
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- =============================================

-- ── 1. Enable UUID extension ──
create extension if not exists "uuid-ossp";

-- ── 2. Companies ──
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  legal_name text,
  default_currency text not null default 'ALEO',
  auto_approve_threshold_micro bigint not null default 1000000000,
  timezone text not null default 'America/New_York',
  fiscal_year_start_month int not null default 1,
  settings jsonb default '{}',
  created_at timestamptz not null default now()
);

-- ── 3. Users ──
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role text not null default 'clerk' check (role in ('admin', 'approver', 'clerk', 'viewer')),
  company_id uuid not null references companies(id) on delete cascade,
  wallet_address text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_users_company on users(company_id);
create index idx_users_email on users(email);

-- ── 4. Vendors ──
create table vendors (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  legal_name text,
  vendor_hash text,
  payment_address text,
  default_token text not null default 'ALEO',
  payment_terms int not null default 30,
  category text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  total_paid_micro bigint not null default 0,
  invoice_count int not null default 0,
  portal_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_vendors_company on vendors(company_id);
create index idx_vendors_status on vendors(status);

-- ── 5. Invoices ──
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_number text,
  vendor_id uuid references vendors(id) on delete set null,
  amount_micro bigint not null default 0,
  tax_amount_micro bigint not null default 0,
  total_amount_micro bigint not null default 0,
  currency text not null default 'USD',
  token text not null default 'ALEO',
  issue_date date,
  due_date date,
  line_items jsonb default '[]',
  gl_code text,
  po_number text,
  notes text,
  pdf_path text,
  pdf_hash text,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paid', 'settled')),
  invoice_hash text,
  aleo_invoice_id text,
  aleo_tx_id text,
  confidence_score real,
  extracted_data jsonb,
  created_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invoices_company on invoices(company_id);
create index idx_invoices_vendor on invoices(vendor_id);
create index idx_invoices_status on invoices(status);
create index idx_invoices_created on invoices(created_at desc);

-- ── 6. Payments ──
create table payments (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  amount_micro bigint not null,
  token text not null default 'ALEO',
  status text not null default 'pending' check (status in ('queued', 'processing', 'settled', 'failed', 'pending', 'completed')),
  batch_id text,
  aleo_tx_id text,
  aleo_payment_id text,
  settlement_anchor text,
  block_height bigint,
  gas_fee_micro bigint,
  settlement_time_s int,
  error_message text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index idx_payments_company on payments(company_id);
create index idx_payments_invoice on payments(invoice_id);
create index idx_payments_status on payments(status);

-- ── 7. Approvals ──
create table approvals (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  approver_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason_hash text,
  reason_text text,
  comments text,
  email_token text,
  email_token_exp timestamptz,
  delegated_from uuid references users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_approvals_invoice on approvals(invoice_id);
create index idx_approvals_approver on approvals(approver_id);
create index idx_approvals_status on approvals(status);

-- ── 8. Audit Proofs ──
create table audit_proofs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  proof_type text not null,
  date_range_start date,
  date_range_end date,
  invoice_ids jsonb default '[]',
  proof_data jsonb,
  aleo_tx_id text,
  authorized_address text,
  disclosure_fields jsonb default '[]',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_audit_proofs_company on audit_proofs(company_id);

-- ── 9. Auto-update updated_at trigger ──
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

-- ══════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Users can only see/modify data belonging
-- to their company.
-- ══════════════════════════════════════════

alter table companies enable row level security;
alter table users enable row level security;
alter table vendors enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table approvals enable row level security;
alter table audit_proofs enable row level security;

-- Helper: get user's company_id from auth
create or replace function get_user_company_id()
returns uuid as $$
  select company_id from users where id = auth.uid();
$$ language sql security definer stable;

-- Companies: users see only their own company
create policy "Users see own company"
  on companies for select
  using (id = get_user_company_id());

create policy "Admins update own company"
  on companies for update
  using (id = get_user_company_id());

-- Users: see teammates in same company
create policy "Users see own company members"
  on users for select
  using (company_id = get_user_company_id());

create policy "Users insert own profile"
  on users for insert
  with check (id = auth.uid());

create policy "Users update own profile"
  on users for update
  using (id = auth.uid());

-- Vendors: company-scoped
create policy "Company members see vendors"
  on vendors for select
  using (company_id = get_user_company_id());

create policy "Company members create vendors"
  on vendors for insert
  with check (company_id = get_user_company_id());

create policy "Company members update vendors"
  on vendors for update
  using (company_id = get_user_company_id());

-- Invoices: company-scoped
create policy "Company members see invoices"
  on invoices for select
  using (company_id = get_user_company_id());

create policy "Company members create invoices"
  on invoices for insert
  with check (company_id = get_user_company_id());

create policy "Company members update invoices"
  on invoices for update
  using (company_id = get_user_company_id());

-- Payments: company-scoped
create policy "Company members see payments"
  on payments for select
  using (company_id = get_user_company_id());

create policy "Company members create payments"
  on payments for insert
  with check (company_id = get_user_company_id());

create policy "Company members update payments"
  on payments for update
  using (company_id = get_user_company_id());

-- Approvals: can see approvals for invoices in their company
create policy "Company members see approvals"
  on approvals for select
  using (
    invoice_id in (
      select id from invoices where company_id = get_user_company_id()
    )
  );

create policy "Company members create approvals"
  on approvals for insert
  with check (
    invoice_id in (
      select id from invoices where company_id = get_user_company_id()
    )
  );

create policy "Approvers update own approvals"
  on approvals for update
  using (approver_id = auth.uid());

-- Audit proofs: company-scoped
create policy "Company members see audit proofs"
  on audit_proofs for select
  using (company_id = get_user_company_id());

create policy "Company members create audit proofs"
  on audit_proofs for insert
  with check (company_id = get_user_company_id());

-- ══════════════════════════════════════════
-- SERVICE ROLE BYPASS
-- The auth callback uses service role key
-- which bypasses RLS automatically.
-- ══════════════════════════════════════════

-- ══════════════════════════════════════════
-- ENABLE REALTIME for live updates
-- ══════════════════════════════════════════

alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table approvals;
