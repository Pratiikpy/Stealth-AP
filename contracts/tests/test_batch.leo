// =============================================
// STEALTHAP BATCH SETTLEMENT — Test Suite
// Tests for stealthap_batch.aleo
// =============================================

import stealthap_batch.aleo;

program test_stealthap_batch.aleo {

    // Test: compute_epoch returns deterministic ID
    @test
    transition test_compute_epoch() {
        let id1: field = stealthap_batch.aleo/compute_epoch(
            1field,  // company_hash
            1u64     // epoch_number
        );

        let id2: field = stealthap_batch.aleo/compute_epoch(
            1field,
            1u64
        );

        assert_eq(id1, id2);
    }

    // Test: different epoch number = different ID
    @test
    transition test_different_epoch_different_id() {
        let id1: field = stealthap_batch.aleo/compute_epoch(
            1field, 1u64
        );

        let id2: field = stealthap_batch.aleo/compute_epoch(
            1field, 2u64
        );

        assert_neq(id1, id2);
    }

    // Test: different company = different ID
    @test
    transition test_different_company_different_id() {
        let id1: field = stealthap_batch.aleo/compute_epoch(
            1field, 1u64
        );

        let id2: field = stealthap_batch.aleo/compute_epoch(
            2field, 1u64
        );

        assert_neq(id1, id2);
    }
}
