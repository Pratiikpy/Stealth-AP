// =============================================
// STEALTHAP PAYMENT v2 — Test Suite
// Tests for stealthap_pay_v2.aleo
// =============================================
// NOTE: Payment transitions require credits.aleo records
// and cannot be tested without testnet deployment.
// Pure computation tests only.

import stealthap_pay_v2.aleo;

program test_stealthap_pay_v2.aleo {

    // Test: compute_anchor returns deterministic anchor
    @test
    transition test_compute_anchor() {
        let anchor1: field = stealthap_pay_v2.aleo/compute_anchor(
            1field,  // invoice_id
            5000u64, // amount
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // payer
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc, // payee (same for test, real would differ)
            777field // nonce
        );

        let anchor2: field = stealthap_pay_v2.aleo/compute_anchor(
            1field, 5000u64,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            777field
        );

        assert_eq(anchor1, anchor2);
    }

    // Test: different amount = different anchor
    @test
    transition test_compute_anchor_different_amount() {
        let anchor1: field = stealthap_pay_v2.aleo/compute_anchor(
            1field, 5000u64,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            777field
        );

        let anchor2: field = stealthap_pay_v2.aleo/compute_anchor(
            1field, 9999u64,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc,
            777field
        );

        assert_neq(anchor1, anchor2);
    }
}
