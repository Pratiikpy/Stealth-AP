-- =============================================
-- STEALTHAP — Initial Database Schema
-- Migration 001: All core tables
-- =============================================

-- 1. Companies
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    legal_name      VARCHAR(255),
    tax_id_hash     VARCHAR(255),
    address         JSONB DEFAULT '{}',
    default_currency VARCHAR(10) DEFAULT 'USD',
    settings        JSONB DEFAULT '{"auto_approve_threshold_cents": 100000, "default_payment_method": "USDCx", "timezone": "UTC", "fiscal_year_start_month": 1}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_name ON companies(name);

-- 2. Users (references Supabase Auth)
CREATE TABLE users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    role            VARCHAR(50) NOT NULL DEFAULT 'clerk',
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    wallet_address  VARCHAR(70),
    avatar_url      VARCHAR(500),
    is_active       BOOLEAN DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_role ON users(company_id, role);

-- 3. Vendors
CREATE TABLE vendors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    legal_name        VARCHAR(255),
    tax_id_encrypted  TEXT,
    vendor_hash       VARCHAR(255),
    payment_address   VARCHAR(70),
    default_token     VARCHAR(10) DEFAULT 'ALEO',
    payment_terms     INTEGER DEFAULT 30,
    category          VARCHAR(100),
    contact_name      VARCHAR(255),
    contact_email     VARCHAR(255),
    contact_phone     VARCHAR(50),
    notes             TEXT,
    status            VARCHAR(20) DEFAULT 'active',
    total_paid_micro  BIGINT DEFAULT 0,
    invoice_count     INTEGER DEFAULT 0,
    portal_enabled    BOOLEAN DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, name)
);

CREATE INDEX idx_vendors_company ON vendors(company_id);
CREATE INDEX idx_vendors_hash ON vendors(vendor_hash);
CREATE INDEX idx_vendors_status ON vendors(company_id, status);
CREATE INDEX idx_vendors_category ON vendors(company_id, category);

-- 4. Invoices
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_number      VARCHAR(100) NOT NULL,
    vendor_id           UUID NOT NULL REFERENCES vendors(id),
    amount_micro        BIGINT NOT NULL,
    tax_amount_micro    BIGINT DEFAULT 0,
    total_amount_micro  BIGINT NOT NULL,
    currency            VARCHAR(10) DEFAULT 'USD',
    token               VARCHAR(10) DEFAULT 'ALEO',
    issue_date          DATE NOT NULL,
    due_date            DATE NOT NULL,
    line_items          JSONB DEFAULT '[]',
    gl_code             VARCHAR(50),
    po_number           VARCHAR(100),
    notes               TEXT,
    pdf_path            VARCHAR(500),
    pdf_hash            VARCHAR(255),
    status              VARCHAR(20) DEFAULT 'draft',
    invoice_hash        VARCHAR(255),
    aleo_invoice_id     VARCHAR(255),
    aleo_tx_id          VARCHAR(255),
    confidence_score    REAL,
    extracted_data      JSONB,
    created_by          UUID REFERENCES users(id),
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, invoice_number)
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_vendor ON invoices(vendor_id);
CREATE INDEX idx_invoices_status ON invoices(company_id, status);
CREATE INDEX idx_invoices_due ON invoices(company_id, due_date);
CREATE INDEX idx_invoices_pdf_hash ON invoices(pdf_hash);
CREATE INDEX idx_invoices_aleo_id ON invoices(aleo_invoice_id);
CREATE INDEX idx_invoices_created ON invoices(company_id, created_at DESC);

-- 5. Payments
CREATE TABLE payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id        UUID REFERENCES invoices(id),
    vendor_id         UUID REFERENCES vendors(id),
    amount_micro      BIGINT NOT NULL,
    token             VARCHAR(10) NOT NULL,
    status            VARCHAR(20) DEFAULT 'pending',
    batch_id          UUID,
    aleo_tx_id        VARCHAR(255),
    aleo_payment_id   VARCHAR(255),
    settlement_anchor VARCHAR(255),
    block_height      INTEGER,
    gas_fee_micro     BIGINT,
    settlement_time_s INTEGER,
    error_message     TEXT,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT now(),
    confirmed_at      TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_vendor ON payments(vendor_id);
CREATE INDEX idx_payments_status ON payments(company_id, status);
CREATE INDEX idx_payments_batch ON payments(batch_id);
CREATE INDEX idx_payments_tx ON payments(aleo_tx_id);

-- 6. Approvals
CREATE TABLE approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    approver_id     UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    reason_hash     VARCHAR(255),
    reason_text     TEXT,
    comments        TEXT,
    email_token     VARCHAR(255),
    email_token_exp TIMESTAMPTZ,
    delegated_from  UUID REFERENCES users(id),
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(invoice_id, approver_id)
);

CREATE INDEX idx_approvals_invoice ON approvals(invoice_id);
CREATE INDEX idx_approvals_approver ON approvals(approver_id, status);
CREATE INDEX idx_approvals_email_token ON approvals(email_token);

-- 7. Approval Rules
CREATE TABLE approval_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    condition_type  VARCHAR(50) NOT NULL,
    operator        VARCHAR(20) NOT NULL,
    threshold_low   BIGINT,
    threshold_high  BIGINT,
    approver_ids    UUID[] NOT NULL,
    approval_type   VARCHAR(20) DEFAULT 'any',
    auto_approve    BOOLEAN DEFAULT false,
    escalation_hours INTEGER DEFAULT 48,
    escalation_to   UUID REFERENCES users(id),
    priority        INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_rules_company ON approval_rules(company_id, is_active);

-- 8. Audit Proofs
CREATE TABLE audit_proofs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    proof_type      VARCHAR(50) NOT NULL,
    date_range_start DATE,
    date_range_end  DATE,
    invoice_ids     UUID[],
    proof_data      JSONB NOT NULL,
    aleo_tx_id      VARCHAR(255),
    authorized_address VARCHAR(70),
    disclosure_fields VARCHAR(50)[],
    expires_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_proofs_company ON audit_proofs(company_id);
CREATE INDEX idx_audit_proofs_type ON audit_proofs(proof_type);

-- 9. Vendor Portal Tokens
CREATE TABLE vendor_portal_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL,
    wallet_address  VARCHAR(70),
    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vpt_vendor ON vendor_portal_tokens(vendor_id);
CREATE INDEX idx_vpt_token ON vendor_portal_tokens(token_hash);

-- 10. Notification Log
CREATE TABLE notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    vendor_id       UUID REFERENCES vendors(id),
    type            VARCHAR(50) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    subject         VARCHAR(500),
    body_preview    VARCHAR(500),
    reference_id    UUID,
    reference_type  VARCHAR(50),
    is_read         BOOLEAN DEFAULT false,
    sent_at         TIMESTAMPTZ DEFAULT now(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notification_log(user_id, is_read, sent_at DESC);
CREATE INDEX idx_notifications_company ON notification_log(company_id, sent_at DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Company isolation: users can only see their own company's data
CREATE POLICY "users_company_isolation" ON users
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "companies_own_only" ON companies
    FOR ALL USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vendors_company_isolation" ON vendors
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "invoices_company_isolation" ON invoices
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "payments_company_isolation" ON payments
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "approvals_company_isolation" ON approvals
    FOR ALL USING (
        invoice_id IN (
            SELECT id FROM invoices
            WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        )
    );

CREATE POLICY "approval_rules_company_isolation" ON approval_rules
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "audit_proofs_company_isolation" ON audit_proofs
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "vpt_company_isolation" ON vendor_portal_tokens
    FOR ALL USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "notifications_user_isolation" ON notification_log
    FOR ALL USING (
        user_id = auth.uid()
        OR company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    );

-- =============================================
-- REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_log;

-- =============================================
-- FUNCTIONS
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_approval_rules_updated_at BEFORE UPDATE ON approval_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Increment vendor invoice count on new invoice
CREATE OR REPLACE FUNCTION increment_vendor_invoice_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendors SET invoice_count = invoice_count + 1 WHERE id = NEW.vendor_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_invoice_count AFTER INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION increment_vendor_invoice_count();
