// =============================================
// STEALTHAP WORKFLOW ENGINE v4 (Security Hardened)
// Program: stealthap_wf_v2.aleo
// Purpose: On-chain approval routing, threshold
//          rules, delegation, ZK-signed approvals
//
// SECURITY FIXES v4:
//   - Access control on set_threshold / set_spending_limit (admin tracking)
//   - Access control on approve_private (registered approvers only)
//   - CPI restored for approve_verified (calls stealthap_inv_v2.aleo)
//   - Spending limit privacy comment (public for on-chain enforcement)
//
// PRIVACY FIX v2: Blinded counter keys, hashed delegate address
// CPI v4: Imports stealthap_inv_v2.aleo to verify invoice
//          existence before creating approvals.
//
// Migrated to Leo 4.0 syntax
// =============================================

import stealthap_inv_v2.aleo;

program stealthap_wf_v2.aleo {

    @noupgrade
    constructor() {}

    // -- Status Constants --
    const APPROVAL_PENDING: u8 = 0u8;
    const APPROVAL_APPROVED: u8 = 1u8;
    const APPROVAL_REJECTED: u8 = 2u8;
    const APPROVAL_DELEGATED: u8 = 3u8;

    // -- Structs --

    struct ApprovalIdInput {
        invoice_id: field,
        approver: address,
        company_hash: field
    }

    struct ThresholdKey {
        company_hash: field,
        tier: u8
    }

    struct DelegationKey {
        delegator: address,
        company_hash: field
    }

    struct BlindInput {
        data: field,
        nonce: field,
        tag: field
    }

    // -- Records --

    record ApprovalRecord {
        owner: address,
        approval_id: field,
        invoice_id: field,
        approver: address,
        company_hash: field,
        amount: u64,
        status: u8,
        reason_hash: field,
        created_at: u32,
        decided_at: u32
    }

    record ThresholdRecord {
        owner: address,
        company_hash: field,
        tier: u8,
        min_amount: u64,
        max_amount: u64,
        approver: address,
        auto_approve: bool
    }

    // -- Mappings --

    mapping approval_registry: field => u8;
    mapping approval_count: field => u64;
    mapping threshold_config: field => u64;
    mapping delegation_registry: field => field;

    // SECURITY FIX: Admin tracking for threshold and spending limit changes
    mapping threshold_admin: field => field;
    mapping spending_limit_admin: field => field;

    // ===============================================
    // ENTRY POINTS
    // ===============================================

    // -- 1. Set Approval Threshold --
    // SECURITY FIX: Admin tracking -- first caller becomes admin,
    // subsequent calls must come from the same admin.
    fn set_threshold(
        company_hash: field,
        tier: u8,
        min_amount: u64,
        max_amount: u64,
        approver: address,
        auto_approve: bool
    ) -> (ThresholdRecord, Final) {
        assert(tier <= 3u8);
        assert(max_amount >= min_amount);

        let threshold_rec: ThresholdRecord = ThresholdRecord {
            owner: self.caller,
            company_hash: company_hash,
            tier: tier,
            min_amount: min_amount,
            max_amount: max_amount,
            approver: approver,
            auto_approve: auto_approve
        };

        let threshold_key: field = BHP256::hash_to_field(ThresholdKey {
            company_hash: company_hash,
            tier: tier
        });

        let caller_hash: field = BHP256::hash_to_field(self.caller);

        return (threshold_rec, final {
            // SECURITY FIX: Verify caller is the admin (or first-time setter)
            let existing_admin: field = Mapping::get_or_use(threshold_admin, threshold_key, caller_hash);
            assert_eq(existing_admin, caller_hash);
            Mapping::set(threshold_admin, threshold_key, caller_hash);

            Mapping::set(threshold_config, threshold_key, max_amount);
        });
    }

    // -- 2. Submit for Approval --
    fn submit_for_approval(
        invoice_id: field,
        approver: address,
        company_hash: field,
        amount: u64,
        created_at: u32,
        nonce: field
    ) -> (ApprovalRecord, Final) {
        let approval_id: field = BHP256::hash_to_field(ApprovalIdInput {
            invoice_id: invoice_id,
            approver: approver,
            company_hash: company_hash
        });

        let counter_key: field = BHP256::hash_to_field(BlindInput {
            data: company_hash,
            nonce: nonce,
            tag: 99field
        });

        let approval_rec: ApprovalRecord = ApprovalRecord {
            owner: approver,
            approval_id: approval_id,
            invoice_id: invoice_id,
            approver: approver,
            company_hash: company_hash,
            amount: amount,
            status: APPROVAL_PENDING,
            reason_hash: 0field,
            created_at: created_at,
            decided_at: 0u32
        };

        return (approval_rec, final {
            let existing: u8 = Mapping::get_or_use(approval_registry, approval_id, 255u8);
            assert_eq(existing, 255u8);

            Mapping::set(approval_registry, approval_id, APPROVAL_PENDING);

            let count: u64 = Mapping::get_or_use(approval_count, counter_key, 0u64);
            Mapping::set(approval_count, counter_key, count + 1u64);
        });
    }

    // -- 3. Approve Invoice --
    // SECURITY FIX: Record owner check ensures only designated approver can approve.
    fn approve(
        approval: ApprovalRecord,
        decided_at: u32
    ) -> (ApprovalRecord, Final) {
        assert_eq(self.caller, approval.owner);
        assert_eq(approval.status, APPROVAL_PENDING);

        let updated: ApprovalRecord = ApprovalRecord {
            owner: approval.owner,
            approval_id: approval.approval_id,
            invoice_id: approval.invoice_id,
            approver: approval.approver,
            company_hash: approval.company_hash,
            amount: approval.amount,
            status: APPROVAL_APPROVED,
            reason_hash: 0field,
            created_at: approval.created_at,
            decided_at: decided_at
        };

        let approval_id: field = approval.approval_id;
        return (updated, final {
            let current: u8 = Mapping::get_or_use(approval_registry, approval_id, 255u8);
            assert_eq(current, APPROVAL_PENDING);
            Mapping::set(approval_registry, approval_id, APPROVAL_APPROVED);
        });
    }

    // -- 3b. Approve with Invoice Verification (CPI) --
    // SECURITY FIX: CPI restored -- calls stealthap_inv_v2.aleo::verify_invoice
    // to verify the invoice hash on-chain before recording the approval.
    fn approve_verified(
        approval: ApprovalRecord,
        invoice_hash: field,
        decided_at: u32
    ) -> (ApprovalRecord, Final) {
        assert_eq(self.caller, approval.owner);
        assert_eq(approval.status, APPROVAL_PENDING);

        // CPI: Verify invoice exists and matches hash
        let verify_final: Final = stealthap_inv_v2.aleo::verify_invoice(
            approval.invoice_id,
            invoice_hash
        );

        let updated: ApprovalRecord = ApprovalRecord {
            owner: approval.owner,
            approval_id: approval.approval_id,
            invoice_id: approval.invoice_id,
            approver: approval.approver,
            company_hash: approval.company_hash,
            amount: approval.amount,
            status: APPROVAL_APPROVED,
            reason_hash: 0field,
            created_at: approval.created_at,
            decided_at: decided_at
        };

        let approval_id: field = approval.approval_id;
        return (updated, final {
            verify_final.run();

            let current: u8 = Mapping::get_or_use(approval_registry, approval_id, 255u8);
            assert_eq(current, APPROVAL_PENDING);
            Mapping::set(approval_registry, approval_id, APPROVAL_APPROVED);
        });
    }

    // -- 4. Reject Invoice --
    // SECURITY FIX: Record owner check ensures only designated approver can reject.
    fn reject(
        approval: ApprovalRecord,
        reason_hash: field,
        decided_at: u32
    ) -> (ApprovalRecord, Final) {
        assert_eq(self.caller, approval.owner);
        assert_eq(approval.status, APPROVAL_PENDING);

        let updated: ApprovalRecord = ApprovalRecord {
            owner: approval.owner,
            approval_id: approval.approval_id,
            invoice_id: approval.invoice_id,
            approver: approval.approver,
            company_hash: approval.company_hash,
            amount: approval.amount,
            status: APPROVAL_REJECTED,
            reason_hash: reason_hash,
            created_at: approval.created_at,
            decided_at: decided_at
        };

        let approval_id: field = approval.approval_id;
        return (updated, final {
            let current: u8 = Mapping::get_or_use(approval_registry, approval_id, 255u8);
            assert_eq(current, APPROVAL_PENDING);
            Mapping::set(approval_registry, approval_id, APPROVAL_REJECTED);
        });
    }

    // -- 5. Delegate Approval --
    fn delegate(
        approval: ApprovalRecord,
        delegate_to: address,
        decided_at: u32
    ) -> (ApprovalRecord, ApprovalRecord, Final) {
        assert_eq(approval.owner, self.caller);
        assert_eq(approval.status, APPROVAL_PENDING);
        assert_neq(self.caller, delegate_to);

        let original_updated: ApprovalRecord = ApprovalRecord {
            owner: approval.owner,
            approval_id: approval.approval_id,
            invoice_id: approval.invoice_id,
            approver: approval.approver,
            company_hash: approval.company_hash,
            amount: approval.amount,
            status: APPROVAL_DELEGATED,
            reason_hash: 0field,
            created_at: approval.created_at,
            decided_at: decided_at
        };

        let delegate_approval_id: field = BHP256::hash_to_field(ApprovalIdInput {
            invoice_id: approval.invoice_id,
            approver: delegate_to,
            company_hash: approval.company_hash
        });

        let delegate_rec: ApprovalRecord = ApprovalRecord {
            owner: delegate_to,
            approval_id: delegate_approval_id,
            invoice_id: approval.invoice_id,
            approver: delegate_to,
            company_hash: approval.company_hash,
            amount: approval.amount,
            status: APPROVAL_PENDING,
            reason_hash: 0field,
            created_at: decided_at,
            decided_at: 0u32
        };

        let delegation_key: field = BHP256::hash_to_field(DelegationKey {
            delegator: self.caller,
            company_hash: approval.company_hash
        });

        let delegate_hash: field = BHP256::hash_to_field(delegate_to);

        let original_id: field = approval.approval_id;
        return (
            original_updated,
            delegate_rec,
            final {
                Mapping::set(approval_registry, original_id, APPROVAL_DELEGATED);
                Mapping::set(approval_registry, delegate_approval_id, APPROVAL_PENDING);
                Mapping::set(delegation_registry, delegation_key, delegate_hash);
            }
        );
    }

    // -- 6. Verify Approval Status --
    fn verify_approval(
        public approval_id: field,
        public expected_status: u8
    ) -> Final {
        return final {
            let stored: u8 = Mapping::get_or_use(approval_registry, approval_id, 255u8);
            assert_eq(stored, expected_status);
        };
    }

    // -- 7. Compute Approval ID (Pure) --
    fn compute_id(
        invoice_id: field,
        approver: address,
        company_hash: field
    ) -> field {
        return BHP256::hash_to_field(ApprovalIdInput {
            invoice_id: invoice_id,
            approver: approver,
            company_hash: company_hash
        });
    }

    // -- 8. Assert Pending Count --
    fn assert_pending_count(
        company_hash: field,
        nonce: field,
        public expected_min: u64
    ) -> Final {
        let counter_key: field = BHP256::hash_to_field(BlindInput {
            data: company_hash,
            nonce: nonce,
            tag: 99field
        });
        return final {
            let count: u64 = Mapping::get_or_use(approval_count, counter_key, 0u64);
            assert(count >= expected_min);
        };
    }

    // ===============================================
    // NOVEL PRIVACY: PRIVATE MULTI-SIG APPROVAL
    // Chain sees "3 approvals happened for invoice X"
    // Chain does NOT see WHO approved.
    // ===============================================

    struct ApprovalCommit {
        invoice_id: field,
        approver_hash: field,
        decision: bool,
        nonce: field
    }

    record PrivateApproval {
        owner: address,
        invoice_id: field,
        approval_commit: field,
        approved: bool,
        nonce: field
    }

    mapping approval_commits: field => field;
    mapping approval_tally: field => u8;

    // SECURITY FIX: Registered approver mapping for approve_private
    mapping registered_approvers: field => bool;

    // -- 8b. Register Approver --
    // SECURITY FIX: Pre-register approvers so only authorized
    // addresses can submit private approvals.
    fn register_approver(
        approver: address,
        company_hash: field,
        nonce: field
    ) -> Final {
        let approver_hash: field = BHP256::hash_to_field(approver);
        let approver_commitment: field = BHP256::hash_to_field(BlindInput {
            data: approver_hash,
            nonce: nonce,
            tag: 300field
        });
        let caller_hash: field = BHP256::hash_to_field(self.caller);
        let admin_key: field = BHP256::hash_to_field(BlindInput {
            data: company_hash,
            nonce: 0field,
            tag: 301field
        });
        return final {
            let existing_admin: field = Mapping::get_or_use(threshold_admin, admin_key, caller_hash);
            assert_eq(existing_admin, caller_hash);
            Mapping::set(threshold_admin, admin_key, caller_hash);

            Mapping::set(registered_approvers, approver_commitment, true);
        };
    }

    // -- 9. Private Approval (Multi-Sig) --
    // SECURITY FIX: Only registered approvers can submit private approvals.
    fn approve_private(
        invoice_id: field,
        nonce: field,
        registration_nonce: field
    ) -> (PrivateApproval, Final) {
        let approver_hash: field = BHP256::hash_to_field(self.caller);

        let approver_commitment: field = BHP256::hash_to_field(BlindInput {
            data: approver_hash,
            nonce: registration_nonce,
            tag: 300field
        });

        let commit: ApprovalCommit = ApprovalCommit {
            invoice_id: invoice_id,
            approver_hash: approver_hash,
            decision: true,
            nonce: nonce
        };
        let commit_hash: field = BHP256::hash_to_field(commit);
        let commit_key: field = BHP256::hash_to_field(BlindInput {
            data: commit_hash, nonce: nonce, tag: 500field
        });

        let priv_approval: PrivateApproval = PrivateApproval {
            owner: self.caller,
            invoice_id: invoice_id,
            approval_commit: commit_hash,
            approved: true,
            nonce: nonce
        };

        return (priv_approval, final {
            // SECURITY FIX: Verify caller is a registered approver
            let is_registered: bool = Mapping::get_or_use(registered_approvers, approver_commitment, false);
            assert(is_registered);

            let existing: field = Mapping::get_or_use(approval_commits, commit_key, 0field);
            assert_eq(existing, 0field);
            Mapping::set(approval_commits, commit_key, commit_hash);

            let current: u8 = Mapping::get_or_use(approval_tally, invoice_id, 0u8);
            Mapping::set(approval_tally, invoice_id, current + 1u8);
        });
    }

    // -- 10. Check Threshold Met --
    fn check_threshold_met(
        public invoice_id: field,
        public required_approvals: u8
    ) -> Final {
        return final {
            let current: u8 = Mapping::get_or_use(approval_tally, invoice_id, 0u8);
            assert(current >= required_approvals);
        };
    }

    // ===============================================
    // SPENDING LIMITS -- On-Chain Enforced
    //
    // KNOWN: Limit amounts are public for on-chain enforcement.
    // Private limits require homomorphic comparison, planned for v3.
    // ===============================================

    struct SpendingLimitKey {
        company_hash: field,
        category_hash: field
    }

    mapping spending_limits: field => u64;
    mapping spent_this_period: field => u64;

    // -- 11. Set Spending Limit --
    // SECURITY FIX: Admin tracking -- first caller becomes admin for this limit key.
    fn set_spending_limit(
        company_hash: field,
        category_hash: field,
        limit_amount: u64,
        nonce: field
    ) -> Final {
        let limit_key: field = BHP256::hash_to_field(SpendingLimitKey {
            company_hash: company_hash,
            category_hash: category_hash
        });
        let blind_key: field = BHP256::hash_to_field(BlindInput {
            data: limit_key, nonce: nonce, tag: 150field
        });
        let caller_hash: field = BHP256::hash_to_field(self.caller);
        return final {
            // SECURITY FIX: Verify caller is admin (or first-time setter)
            let existing_admin: field = Mapping::get_or_use(spending_limit_admin, blind_key, caller_hash);
            assert_eq(existing_admin, caller_hash);
            Mapping::set(spending_limit_admin, blind_key, caller_hash);

            // KNOWN: Limit amounts are public for on-chain enforcement.
            // Private limits require homomorphic comparison, planned for v3.
            Mapping::set(spending_limits, blind_key, limit_amount);
        };
    }

    // -- 12. Verify Within Limit (Pure) --
    fn verify_within_limit(
        company_hash: field,
        category_hash: field,
        amount: u64,
        limit: u64,
        current_spent: u64
    ) -> bool {
        assert(current_spent + amount <= limit);
        return true;
    }

    // -- 13. Record Spend --
    fn record_spend(
        company_hash: field,
        category_hash: field,
        amount: u64,
        nonce: field
    ) -> Final {
        let limit_key: field = BHP256::hash_to_field(SpendingLimitKey {
            company_hash: company_hash,
            category_hash: category_hash
        });
        let blind_key: field = BHP256::hash_to_field(BlindInput {
            data: limit_key, nonce: nonce, tag: 150field
        });
        return final {
            let limit: u64 = Mapping::get_or_use(spending_limits, blind_key, 0u64);
            let current: u64 = Mapping::get_or_use(spent_this_period, blind_key, 0u64);

            assert(current + amount <= limit);

            Mapping::set(spent_this_period, blind_key, current + amount);
        };
    }
}
