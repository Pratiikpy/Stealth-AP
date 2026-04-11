// =============================================
// STEALTHAP AUDIT ENGINE v3
// Program: stealthap_audit.aleo
// Purpose: ZK proof generation for date ranges,
//          selective disclosure, compliance anchors,
//          audit authorization management
//
// PRIVACY FIX v2: Blinded counter keys, no raw company_hash in finalize
// CPI v3: Imports stealthap_invoice.aleo to verify commitment
//          roots when generating audit proofs.
// =============================================

import stealthap_invoice.aleo;

// -- Helper Structs (outside program for use in helper fns) --

struct BlindInput {
    data: field,
    nonce: field,
    tag: field
}

// -- Helper Functions (outside program block) --

fn blind_counter_key(company_hash: field, nonce: field) -> field {
    return BHP256::hash_to_field(BlindInput {
        data: company_hash,
        nonce: nonce,
        tag: 99field
    });
}

program stealthap_audit.aleo {

    @noupgrade
    constructor() {}

    // -- Constants --
    const PROOF_ACTIVE: u8 = 1u8;
    const PROOF_EXPIRED: u8 = 0u8;

    // -- Structs --

    struct AuditProofInput {
        company_hash: field,
        date_start: u32,
        date_end: u32,
        total_amount: u64,
        invoice_count: u64,
        nonce: field
    }

    struct DisclosureInput {
        invoice_id: field,
        disclosed_fields: field,
        authorized_address: address,
        nonce: field
    }

    struct AuthorizationKey {
        company_hash: field,
        auditor: address
    }

    struct ComplianceInput {
        company_hash: field,
        total_payments: u64,
        total_approved: u64,
        approval_rate_bps: u64,
        nonce: field
    }

    // -- Records --

    record AuditProofRecord {
        owner: address,
        proof_id: field,
        company_hash: field,
        date_start: u32,
        date_end: u32,
        total_amount: u64,
        invoice_count: u64,
        proof_anchor: field,
        status: u8
    }

    record DisclosureRecord {
        owner: address,
        disclosure_id: field,
        invoice_id: field,
        disclosed_fields: field,
        proof_anchor: field,
        authorized_address: address,
        expires_at: u32
    }

    record ComplianceRecord {
        owner: address,
        compliance_id: field,
        company_hash: field,
        total_payments: u64,
        total_approved: u64,
        approval_rate_bps: u64,
        proof_anchor: field,
        generated_at: u32
    }

    // -- Mappings --

    mapping audit_proofs: field => field;
    mapping audit_anchors: field => u8;
    mapping audit_authorizations: field => u32;
    mapping audit_counter: field => u64;          // blinded_counter_key => count (NOT company_hash)
    mapping compliance_anchors: field => field;
    mapping disclosure_registry: field => field;

    // ===============================================
    // TRANSITIONS
    // ===============================================

    // -- 1. Generate Audit Proof --
    fn generate_audit_proof(
        company_hash: field,
        date_start: u32,
        date_end: u32,
        total_amount: u64,
        invoice_count: u64,
        nonce: field
    ) -> (AuditProofRecord, Final) {
        assert(date_end >= date_start);
        assert(invoice_count > 0u64);

        let proof_input: AuditProofInput = AuditProofInput {
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: total_amount,
            invoice_count: invoice_count,
            nonce: nonce
        };

        let proof_anchor: field = BHP256::hash_to_field(proof_input);
        let proof_id: field = BHP256::hash_to_field(AuditProofInput {
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: 0u64,
            invoice_count: 0u64,
            nonce: nonce
        });

        // PRIVACY FIX: Blind counter key in transition
        let counter_key: field = blind_counter_key(company_hash, nonce);

        let proof_rec: AuditProofRecord = AuditProofRecord {
            owner: self.caller,
            proof_id: proof_id,
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: total_amount,
            invoice_count: invoice_count,
            proof_anchor: proof_anchor,
            status: PROOF_ACTIVE
        };

        // PRIVACY FIX: counter_key (blinded) instead of company_hash
        return (proof_rec, final {
            Mapping::set(audit_proofs, proof_id, proof_anchor);
            Mapping::set(audit_anchors, proof_anchor, PROOF_ACTIVE);

            let count: u64 = Mapping::get_or_use(audit_counter, counter_key, 0u64);
            Mapping::set(audit_counter, counter_key, count + 1u64);
        });
    }

    // -- 2. Selective Disclosure --
    fn selective_disclose(
        invoice_id: field,
        disclosed_fields: field,
        authorized_address: address,
        expires_at: u32,
        nonce: field
    ) -> (DisclosureRecord, Final) {
        let disclosure_input: DisclosureInput = DisclosureInput {
            invoice_id: invoice_id,
            disclosed_fields: disclosed_fields,
            authorized_address: authorized_address,
            nonce: nonce
        };

        let disclosure_id: field = BHP256::hash_to_field(disclosure_input);
        let proof_anchor: field = BHP256::hash_to_field(disclosure_input);

        let disc_rec: DisclosureRecord = DisclosureRecord {
            owner: authorized_address,
            disclosure_id: disclosure_id,
            invoice_id: invoice_id,
            disclosed_fields: disclosed_fields,
            proof_anchor: proof_anchor,
            authorized_address: authorized_address,
            expires_at: expires_at
        };

        return (disc_rec, final {
            Mapping::set(disclosure_registry, disclosure_id, proof_anchor);
        });
    }

    // -- 3. Set Audit Authorization --
    fn set_audit_authorization(
        company_hash: field,
        auditor: address,
        expires_at: u32
    ) -> Final {
        let auth_key: field = BHP256::hash_to_field(AuthorizationKey {
            company_hash: company_hash,
            auditor: auditor
        });
        return final {
            Mapping::set(audit_authorizations, auth_key, expires_at);
        };
    }

    // -- 4. Revoke Audit Authorization --
    fn revoke_audit_authorization(
        company_hash: field,
        auditor: address
    ) -> Final {
        let auth_key: field = BHP256::hash_to_field(AuthorizationKey {
            company_hash: company_hash,
            auditor: auditor
        });
        return final {
            Mapping::set(audit_authorizations, auth_key, 0u32);
        };
    }

    // -- 5. Generate Compliance Proof --
    fn generate_compliance_proof(
        company_hash: field,
        total_payments: u64,
        total_approved: u64,
        nonce: field,
        generated_at: u32
    ) -> (ComplianceRecord, Final) {
        assert(total_payments > 0u64);
        assert(total_approved <= total_payments);

        let approval_rate_bps: u64 = (total_approved * 10000u64) / total_payments;

        let compliance_input: ComplianceInput = ComplianceInput {
            company_hash: company_hash,
            total_payments: total_payments,
            total_approved: total_approved,
            approval_rate_bps: approval_rate_bps,
            nonce: nonce
        };

        let proof_anchor: field = BHP256::hash_to_field(compliance_input);
        let compliance_id: field = BHP256::hash_to_field(ComplianceInput {
            company_hash: company_hash,
            total_payments: 0u64,
            total_approved: 0u64,
            approval_rate_bps: 0u64,
            nonce: nonce
        });

        let comp_rec: ComplianceRecord = ComplianceRecord {
            owner: self.caller,
            compliance_id: compliance_id,
            company_hash: company_hash,
            total_payments: total_payments,
            total_approved: total_approved,
            approval_rate_bps: approval_rate_bps,
            proof_anchor: proof_anchor,
            generated_at: generated_at
        };

        // PRIVACY FIX: finalize gets ONLY compliance_id + proof_anchor
        // company_hash is NOT passed -- it was never used in finalize anyway
        return (comp_rec, final {
            Mapping::set(compliance_anchors, compliance_id, proof_anchor);
        });
    }

    // -- 5b. Generate Verified Audit Proof (CPI) --
    // Cross-program call: verifies invoice commitment_root exists
    // on-chain before including it in the audit proof. Proves the
    // invoice data that the proof covers is genuinely committed.
    fn generate_verified_proof(
        company_hash: field,
        invoice_id: field,
        expected_commitment: field,
        date_start: u32,
        date_end: u32,
        total_amount: u64,
        invoice_count: u64,
        nonce: field
    ) -> (AuditProofRecord, Final) {
        assert(date_end >= date_start);
        assert(invoice_count > 0u64);

        // CPI: Verify invoice commitment exists on-chain
        let verify_final: Final = stealthap_invoice.aleo::assert_commitment(
            invoice_id,
            expected_commitment
        );

        let proof_input: AuditProofInput = AuditProofInput {
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: total_amount,
            invoice_count: invoice_count,
            nonce: nonce
        };

        let proof_anchor: field = BHP256::hash_to_field(proof_input);
        let proof_id: field = BHP256::hash_to_field(AuditProofInput {
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: 0u64,
            invoice_count: 0u64,
            nonce: nonce
        });

        let counter_key: field = blind_counter_key(company_hash, nonce);

        let verified_rec: AuditProofRecord = AuditProofRecord {
            owner: self.caller,
            proof_id: proof_id,
            company_hash: company_hash,
            date_start: date_start,
            date_end: date_end,
            total_amount: total_amount,
            invoice_count: invoice_count,
            proof_anchor: proof_anchor,
            status: PROOF_ACTIVE
        };

        return (verified_rec, final {
            // Run CPI -- if commitment doesn't exist, proof is rejected
            verify_final.run();

            Mapping::set(audit_proofs, proof_id, proof_anchor);
            Mapping::set(audit_anchors, proof_anchor, PROOF_ACTIVE);

            let count: u64 = Mapping::get_or_use(audit_counter, counter_key, 0u64);
            Mapping::set(audit_counter, counter_key, count + 1u64);
        });
    }

    // -- 6. Verify Audit Proof --
    fn verify_audit_proof(
        public proof_id: field,
        public expected_anchor: field
    ) -> Final {
        return final {
            let stored: field = Mapping::get_or_use(audit_proofs, proof_id, 0field);
            assert_neq(stored, 0field);
            assert_eq(stored, expected_anchor);
        };
    }

    // -- 7. Verify Disclosure --
    fn verify_disclosure(
        public disclosure_id: field,
        public expected_anchor: field
    ) -> Final {
        return final {
            let stored: field = Mapping::get_or_use(disclosure_registry, disclosure_id, 0field);
            assert_eq(stored, expected_anchor);
        };
    }

    // -- 8. Assert Audit Count --
    fn assert_audit_count(
        company_hash: field,
        nonce: field,
        public expected_min: u64
    ) -> Final {
        // PRIVACY FIX: Blind in transition
        let counter_key: field = blind_counter_key(company_hash, nonce);
        return final {
            let count: u64 = Mapping::get_or_use(audit_counter, counter_key, 0u64);
            assert(count >= expected_min);
        };
    }

    // ===============================================
    // PAYMENT REPUTATION / CREDIT SCORING
    // ZK proof of payment history: on-time rate,
    // volume, amount range, age -- without revealing
    // actual payment details.
    // ===============================================

    struct CreditScoreInput {
        company_hash: field,
        total_payments: u64,
        on_time_payments: u64,
        total_volume: u64,
        account_age_days: u32,
        nonce: field
    }

    record CreditProofRecord {
        owner: address,
        score_id: field,
        company_hash: field,
        on_time_rate_bps: u64,
        total_payments: u64,
        total_volume: u64,
        account_age_days: u32,
        score_anchor: field,
        is_valid: bool
    }

    mapping credit_scores: field => field;  // score_id => score_anchor

    // -- 9. Generate Credit Score Proof --
    // Proves payment reputation without revealing
    // individual payment details.
    fn generate_credit_proof(
        company_hash: field,
        total_payments: u64,
        on_time_payments: u64,
        total_volume: u64,
        account_age_days: u32,
        nonce: field,
        min_on_time_bps: u64
    ) -> (CreditProofRecord, Final) {
        assert(total_payments > 0u64);
        assert(on_time_payments <= total_payments);

        let on_time_rate_bps: u64 = (on_time_payments * 10000u64) / total_payments;
        let is_valid: bool = on_time_rate_bps >= min_on_time_bps;

        let score_input: CreditScoreInput = CreditScoreInput {
            company_hash: company_hash,
            total_payments: total_payments,
            on_time_payments: on_time_payments,
            total_volume: total_volume,
            account_age_days: account_age_days,
            nonce: nonce
        };
        let score_anchor: field = BHP256::hash_to_field(score_input);

        let score_id: field = BHP256::hash_to_field(CreditScoreInput {
            company_hash: company_hash,
            total_payments: 0u64,
            on_time_payments: 0u64,
            total_volume: 0u64,
            account_age_days: 0u32,
            nonce: nonce
        });

        let credit_rec: CreditProofRecord = CreditProofRecord {
            owner: self.caller,
            score_id: score_id,
            company_hash: company_hash,
            on_time_rate_bps: on_time_rate_bps,
            total_payments: total_payments,
            total_volume: total_volume,
            account_age_days: account_age_days,
            score_anchor: score_anchor,
            is_valid: is_valid
        };

        return (credit_rec, final {
            Mapping::set(credit_scores, score_id, score_anchor);
        });
    }

    // -- 10. Verify Credit Score --
    fn verify_credit_score(
        public score_id: field,
        public expected_anchor: field
    ) -> Final {
        return final {
            let stored: field = Mapping::get_or_use(credit_scores, score_id, 0field);
            assert_neq(stored, 0field);
            assert_eq(stored, expected_anchor);
        };
    }
}
