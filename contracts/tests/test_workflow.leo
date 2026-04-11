// =============================================
// STEALTHAP WORKFLOW v2 — Test Suite
// Tests for stealthap_wf_v2.aleo
// =============================================

import stealthap_wf_v2.aleo;

program test_stealthap_wf_v2.aleo {

    // Test: compute_id returns deterministic ID
    @test
    transition test_compute_approval_id() {
        let id1: field = stealthap_wf_v2.aleo/compute_id(
            1field, // invoice_id
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // approver
            2field  // company_hash
        );

        let id2: field = stealthap_wf_v2.aleo/compute_id(
            1field,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            2field
        );

        assert_eq(id1, id2);
    }

    // Test: different invoice = different approval ID
    @test
    transition test_different_invoice_different_id() {
        let id1: field = stealthap_wf_v2.aleo/compute_id(
            1field,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            2field
        );

        let id2: field = stealthap_wf_v2.aleo/compute_id(
            99field,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            2field
        );

        assert_neq(id1, id2);
    }
}
