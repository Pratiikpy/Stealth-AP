// =============================================
// STEALTHAP AUDIT v2 — Test Suite
// Tests for stealthap_aud_v2.aleo
// =============================================

import stealthap_aud_v2.aleo;

program test_stealthap_aud_v2.aleo {

    // Test: verify_audit_proof rejects non-existent proofs
    @test
    @should_fail
    transition test_verify_nonexistent_proof() {
        // This should fail because no proof with this ID exists
        stealthap_aud_v2.aleo/verify_audit_proof(
            123field,  // fake proof_id
            456field   // fake anchor
        );
    }

    // Test: verify_disclosure rejects non-existent disclosures
    @test
    @should_fail
    transition test_verify_nonexistent_disclosure() {
        stealthap_aud_v2.aleo/verify_disclosure(
            789field,  // fake disclosure_id
            101field   // fake anchor
        );
    }

    // Test: verify_credit_score rejects non-existent scores
    @test
    @should_fail
    transition test_verify_nonexistent_credit() {
        stealthap_aud_v2.aleo/verify_credit_score(
            111field,  // fake score_id
            222field   // fake anchor
        );
    }
}
