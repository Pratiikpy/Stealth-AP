// =============================================
// STEALTHAP INVOICE v2 — Test Suite
// Tests for stealthap_inv_v2.aleo
// =============================================
// NOTE: Many transitions require private record inputs
// which cannot be auto-tested in CI/CD.
// These tests cover pure computation transitions.
// Full integration tests require testnet deployment.

import stealthap_inv_v2.aleo;

program test_stealthap_inv_v2.aleo {

    // Test: compute_id returns deterministic hash
    @test
    transition test_compute_id() {
        let id1: field = stealthap_inv_v2.aleo/compute_id(
            1field,   // company_hash
            2field,   // vendor_hash
            1000u64,  // amount
            1700000000u32, // due_date
            999field  // nonce
        );

        let id2: field = stealthap_inv_v2.aleo/compute_id(
            1field,
            2field,
            1000u64,
            1700000000u32,
            999field
        );

        // Same inputs = same output (deterministic)
        assert_eq(id1, id2);
    }

    // Test: different nonce = different ID
    @test
    transition test_compute_id_different_nonce() {
        let id1: field = stealthap_inv_v2.aleo/compute_id(
            1field, 2field, 1000u64, 1700000000u32, 111field
        );

        let id2: field = stealthap_inv_v2.aleo/compute_id(
            1field, 2field, 1000u64, 1700000000u32, 222field
        );

        // Different nonce = different ID
        assert_neq(id1, id2);
    }

    // Test: compute_hash returns deterministic hash
    @test
    transition test_compute_hash() {
        let hash1: field = stealthap_inv_v2.aleo/compute_hash(
            1field, 2field, 1000u64, 100u64,
            1700000000u32, 1699000000u32,
            3field, 4field, 5field, 6field
        );

        let hash2: field = stealthap_inv_v2.aleo/compute_hash(
            1field, 2field, 1000u64, 100u64,
            1700000000u32, 1699000000u32,
            3field, 4field, 5field, 6field
        );

        assert_eq(hash1, hash2);
    }

    // Test: different amount = different hash
    @test
    transition test_compute_hash_different_amount() {
        let hash1: field = stealthap_inv_v2.aleo/compute_hash(
            1field, 2field, 1000u64, 100u64,
            1700000000u32, 1699000000u32,
            3field, 4field, 5field, 6field
        );

        let hash2: field = stealthap_inv_v2.aleo/compute_hash(
            1field, 2field, 2000u64, 100u64,
            1700000000u32, 1699000000u32,
            3field, 4field, 5field, 6field
        );

        assert_neq(hash1, hash2);
    }
}
