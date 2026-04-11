-- =============================================
-- STEALTHAP DEMO DATA
-- Pre-populated data so judges see a working app
-- 1 company, 3 users, 5 vendors, 8 invoices in various states
-- =============================================

-- Company
INSERT INTO companies (id, name, legal_name, default_currency, settings) VALUES
('c0000000-0000-0000-0000-000000000001', 'Stealth Labs', 'Stealth Labs Inc.', 'USD',
 '{"auto_approve_threshold_cents": 100000, "default_payment_method": "USDCx", "timezone": "UTC"}');

-- Vendors
INSERT INTO vendors (id, company_id, name, category, payment_address, default_token, payment_terms, contact_email, status, total_paid_micro, invoice_count) VALUES
('v0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Acme Corporation', 'Software', 'aleo1acme7890abcdef1234567890abcdef1234567890abcdef1234567890', 'USDCx', 30, 'billing@acme.com', 'active', 8950000, 4),
('v0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'TechSupply Co', 'Hardware', 'aleo1tech5678abcdef1234567890abcdef1234567890abcdef1234567890', 'ALEO', 30, 'ar@techsupply.io', 'active', 3200000, 2),
('v0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'DataFlow Systems', 'Cloud Services', 'aleo1data9012abcdef1234567890abcdef1234567890abcdef1234567890', 'USDCx', 45, 'accounts@dataflow.dev', 'active', 6400000, 3),
('v0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'CloudServe Ltd', 'Infrastructure', 'aleo1clou3456abcdef1234567890abcdef1234567890abcdef1234567890', 'USAD', 15, 'finance@cloudserve.com', 'active', 4520000, 2),
('v0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'SecureAudit LLC', 'Professional Services', 'aleo1audit7890abcdef1234567890abcdef1234567890abcdef1234567890', 'USDCx', 60, 'billing@secureaudit.com', 'active', 0, 1);

-- Invoices (8 in various states: 1 draft, 2 pending, 1 approved, 1 escrowed, 2 paid, 1 rejected)
INSERT INTO invoices (id, company_id, invoice_number, vendor_id, amount_micro, tax_amount_micro, total_amount_micro, currency, token, issue_date, due_date, status, gl_code, po_number, created_at) VALUES
('i0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'INV-108', 'v0000000-0000-0000-0000-000000000001', 3500000, 0, 3500000, 'USD', 'USDCx', '2026-04-01', '2026-04-30', 'draft', '6000', NULL, NOW() - INTERVAL '2 days'),
('i0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'INV-107', 'v0000000-0000-0000-0000-000000000002', 820000, 0, 820000, 'USD', 'ALEO', '2026-03-28', '2026-04-28', 'pending', '7100', NULL, NOW() - INTERVAL '5 days'),
('i0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'INV-106', 'v0000000-0000-0000-0000-000000000003', 1280000, 128000, 1408000, 'USD', 'USDCx', '2026-03-25', '2026-04-25', 'pending', '6200', 'PO-2841', NOW() - INTERVAL '8 days'),
('i0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'INV-105', 'v0000000-0000-0000-0000-000000000005', 15000000, 0, 15000000, 'USD', 'USDCx', '2026-03-20', '2026-04-20', 'approved', '6500', 'PO-2840', NOW() - INTERVAL '12 days'),
('i0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'INV-104', 'v0000000-0000-0000-0000-000000000001', 2450000, 0, 2450000, 'USD', 'USDCx', '2026-03-15', '2026-04-15', 'approved', '6000', 'PO-2847', NOW() - INTERVAL '18 days'),
('i0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'INV-101', 'v0000000-0000-0000-0000-000000000004', 4520000, 0, 4520000, 'USD', 'USAD', '2026-02-20', '2026-03-20', 'paid', '6000', NULL, NOW() - INTERVAL '40 days'),
('i0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'INV-100', 'v0000000-0000-0000-0000-000000000002', 640000, 0, 640000, 'USD', 'ALEO', '2026-02-15', '2026-03-15', 'paid', '7200', NULL, NOW() - INTERVAL '45 days'),
('i0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'INV-099', 'v0000000-0000-0000-0000-000000000001', 1500000, 0, 1500000, 'USD', 'USDCx', '2026-02-10', '2026-03-10', 'rejected', '6000', NULL, NOW() - INTERVAL '50 days');

-- Payments for paid invoices
INSERT INTO payments (id, company_id, invoice_id, vendor_id, amount_micro, token, status, settlement_time_s, aleo_tx_id, confirmed_at, created_at) VALUES
('p0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'i0000000-0000-0000-0000-000000000006', 'v0000000-0000-0000-0000-000000000004', 4520000, 'USAD', 'completed', 107, 'at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp', NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days'),
('p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'i0000000-0000-0000-0000-000000000007', 'v0000000-0000-0000-0000-000000000002', 640000, 'ALEO', 'completed', 92, 'at1abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890', NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days');

-- Approval rules
INSERT INTO approval_rules (id, company_id, name, condition_type, operator, threshold_low, threshold_high, approver_ids, approval_type, auto_approve, priority, is_active) VALUES
('r0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Auto-approve small', 'amount', 'lte', 0, 1000000, '{}', 'any', true, 0, true),
('r0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Manager approval', 'amount', 'between', 1000000, 10000000, '{}', 'any', false, 1, true),
('r0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'CFO approval', 'amount', 'gte', 10000000, NULL, '{}', 'all', false, 2, true);
