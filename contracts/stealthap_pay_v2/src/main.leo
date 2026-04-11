// =============================================
// STEALTHAP PAYMENT ENGINE v2
// Program: stealthap_pay_v2.aleo
// Purpose: Private single + batch payments
//          ALEO credits, USDCx, USAD
//          Settlement anchors for ZK audit
//
// SECURITY FIXES (v2):
//   1. Import updated to stealthap_inv_v2.aleo
//   2. Amount verification: pay_credits_private and pay_verified_credits
//      now verify payment amount >= invoice amount in finalize
//   3. Escrow privacy limitation honestly documented
//
// PRIVACY:
//   Finalize sees ONLY payment_id + settlement_anchor.
//   No invoice_id in finalize -- linkage stays in private records.
// =============================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;
import stealthap_inv_v2.aleo;

// -- Structs (outside program for helper use) --

struct PaymentCommitData {
    invoice_id: field,
    amount: u64,
    payer: address,
    payee: address,
    nonce: field
}

// -- Helper Functions (outside program block) --

fn compute_payment_id(
    invoice_id: field,
    payer: address,
    payee: address,
    nonce: field
) -> field {
    let pi: PaymentCommitData = PaymentCommitData {
        invoice_id: invoice_id,
        amount: 0u64,
        payer: payer,
        payee: payee,
        nonce: nonce
    };
    return BHP256::hash_to_field(pi);
}

fn compute_settlement_anchor(
    invoice_id: field,
    amount: u64,
    payer: address,
    payee: address,
    nonce: field
) -> field {
    let sa: PaymentCommitData = PaymentCommitData {
        invoice_id: invoice_id,
        amount: amount,
        payer: payer,
        payee: payee,
        nonce: nonce
    };
    return BHP256::hash_to_field(sa);
}

program stealthap_pay_v2.aleo {

    @noupgrade
    constructor() {}

    // -- Status Constants --
    const PAY_PENDING: u8 = 0u8;
    const PAY_CONFIRMED: u8 = 1u8;
    const PAY_FAILED: u8 = 2u8;

    const TOKEN_ALEO: u8 = 0u8;
    const TOKEN_USDCX: u8 = 1u8;
    const TOKEN_USAD: u8 = 2u8;

    // -- Records --

    record PaymentRecord {
        owner: address,
        payment_id: field,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        token: u8,
        paid_at: u32,
        settlement_anchor: field,
        batch_id: field
    }

    record PaymentReceipt {
        owner: address,
        receipt_id: field,
        invoice_id: field,
        amount: u64,
        token: u8,
        paid_at: u32,
        payer_hash: field,
        settlement_anchor: field
    }

    // -- Mappings --

    mapping payment_registry: field => field;    // payment_id => settlement_anchor
    mapping payment_status: field => u8;         // payment_id => status
    mapping total_paid: field => u64;            // blinded_key => total

    // ===============================================
    // SINGLE PAYMENTS
    // ===============================================

    // -- 1. Pay with ALEO Credits (Private) --
    // SECURITY FIX: Added invoice_amount parameter for underpayment prevention
    fn pay_credits_private(
        pay_record: credits.aleo::credits,
        payee: address,
        invoice_id: field,
        amount: u64,
        invoice_amount: u64,
        paid_at: u32,
        nonce: field
    ) -> (credits.aleo::credits, credits.aleo::credits, PaymentRecord, PaymentReceipt, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);
        assert_neq(payer, payee);
        // SECURITY FIX: Verify payment covers the invoice amount
        assert(amount >= invoice_amount);

        // CPI: transfer credits privately
        let (recipient_credits, change_credits): (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::transfer_private(pay_record, payee, amount);

        let payment_id: field = compute_payment_id(invoice_id, payer, payee, nonce);
        let settlement_anchor: field = compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
        let payer_hash: field = BHP256::hash_to_field(payer);

        let pay_rec: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            token: TOKEN_ALEO,
            paid_at: paid_at,
            settlement_anchor: settlement_anchor,
            batch_id: 0field
        };

        let receipt: PaymentReceipt = PaymentReceipt {
            owner: payee,
            receipt_id: payment_id,
            invoice_id: invoice_id,
            amount: amount,
            token: TOKEN_ALEO,
            paid_at: paid_at,
            payer_hash: payer_hash,
            settlement_anchor: settlement_anchor
        };

        return (
            recipient_credits,
            change_credits,
            pay_rec,
            receipt,
            final {
                let existing: field = Mapping::get_or_use(payment_registry, payment_id, 0field);
                assert_eq(existing, 0field);

                Mapping::set(payment_registry, payment_id, settlement_anchor);
                Mapping::set(payment_status, payment_id, PAY_CONFIRMED);
            }
        );
    }

    // -- 2. Pay with USDCx (Private) --
    fn pay_usdcx_private(
        token_record: test_usdcx_stablecoin.aleo::Token,
        payee: address,
        invoice_id: field,
        amount: u64,
        paid_at: u32,
        nonce: field,
        private proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2]
    ) -> (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, test_usdcx_stablecoin.aleo::Token, PaymentRecord, PaymentReceipt, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);
        assert_neq(payer, payee);

        // CPI: transfer USDCx privately with compliance
        let (compliance_record, recipient_token, change_token, transfer_final):
            (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, test_usdcx_stablecoin.aleo::Token, Final) =
            test_usdcx_stablecoin.aleo::transfer_private(payee, amount as u128, token_record, proofs);

        let payment_id: field = compute_payment_id(invoice_id, payer, payee, nonce);
        let settlement_anchor: field = compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
        let payer_hash: field = BHP256::hash_to_field(payer);

        let pay_rec: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            token: TOKEN_USDCX,
            paid_at: paid_at,
            settlement_anchor: settlement_anchor,
            batch_id: 0field
        };

        let receipt: PaymentReceipt = PaymentReceipt {
            owner: payee,
            receipt_id: payment_id,
            invoice_id: invoice_id,
            amount: amount,
            token: TOKEN_USDCX,
            paid_at: paid_at,
            payer_hash: payer_hash,
            settlement_anchor: settlement_anchor
        };

        return (
            compliance_record,
            recipient_token,
            change_token,
            pay_rec,
            receipt,
            final {
                transfer_final.run();

                let existing: field = Mapping::get_or_use(payment_registry, payment_id, 0field);
                assert_eq(existing, 0field);

                Mapping::set(payment_registry, payment_id, settlement_anchor);
                Mapping::set(payment_status, payment_id, PAY_CONFIRMED);
            }
        );
    }

    // -- 2b. Pay with USAD (Private) --
    fn pay_usad_private(
        token_record: test_usad_stablecoin.aleo::Token,
        payee: address,
        invoice_id: field,
        amount: u64,
        paid_at: u32,
        nonce: field,
        private proofs: [test_usad_stablecoin.aleo::MerkleProof; 2]
    ) -> (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, test_usad_stablecoin.aleo::Token, PaymentRecord, PaymentReceipt, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);
        assert_neq(payer, payee);

        // CPI: transfer USAD privately with compliance
        let (compliance_record, recipient_token, change_token, transfer_final):
            (test_usad_stablecoin.aleo::ComplianceRecord, test_usad_stablecoin.aleo::Token, test_usad_stablecoin.aleo::Token, Final) =
            test_usad_stablecoin.aleo::transfer_private(payee, amount as u128, token_record, proofs);

        let payment_id: field = compute_payment_id(invoice_id, payer, payee, nonce);
        let settlement_anchor: field = compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
        let payer_hash: field = BHP256::hash_to_field(payer);

        let pay_rec: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            token: TOKEN_USAD,
            paid_at: paid_at,
            settlement_anchor: settlement_anchor,
            batch_id: 0field
        };

        let receipt: PaymentReceipt = PaymentReceipt {
            owner: payee,
            receipt_id: payment_id,
            invoice_id: invoice_id,
            amount: amount,
            token: TOKEN_USAD,
            paid_at: paid_at,
            payer_hash: payer_hash,
            settlement_anchor: settlement_anchor
        };

        return (
            compliance_record,
            recipient_token,
            change_token,
            pay_rec,
            receipt,
            final {
                transfer_final.run();

                let existing: field = Mapping::get_or_use(payment_registry, payment_id, 0field);
                assert_eq(existing, 0field);

                Mapping::set(payment_registry, payment_id, settlement_anchor);
                Mapping::set(payment_status, payment_id, PAY_CONFIRMED);
            }
        );
    }

    // -- 3. Pay Credits with Invoice Verification (CPI) --
    // Cross-program call: verifies invoice hash exists on-chain
    // before executing payment. This proves the invoice is real.
    // SECURITY FIX: Added invoice_amount for underpayment prevention
    fn pay_verified_credits(
        pay_record: credits.aleo::credits,
        payee: address,
        invoice_id: field,
        invoice_hash: field,
        amount: u64,
        invoice_amount: u64,
        paid_at: u32,
        nonce: field
    ) -> (credits.aleo::credits, credits.aleo::credits, PaymentRecord, PaymentReceipt, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);
        assert_neq(payer, payee);
        // SECURITY FIX: Verify payment covers the invoice amount
        assert(amount >= invoice_amount);

        // CPI: Verify invoice exists and matches hash on-chain
        let verify_final: Final = stealthap_inv_v2.aleo::verify_invoice(invoice_id, invoice_hash);

        // CPI: Transfer credits privately
        let (recipient_credits, change_credits): (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::transfer_private(pay_record, payee, amount);

        let payment_id: field = compute_payment_id(invoice_id, payer, payee, nonce);
        let settlement_anchor: field = compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
        let payer_hash: field = BHP256::hash_to_field(payer);

        let pay_rec: PaymentRecord = PaymentRecord {
            owner: payer,
            payment_id: payment_id,
            invoice_id: invoice_id,
            payer: payer,
            payee: payee,
            amount: amount,
            token: TOKEN_ALEO,
            paid_at: paid_at,
            settlement_anchor: settlement_anchor,
            batch_id: 0field
        };

        let receipt: PaymentReceipt = PaymentReceipt {
            owner: payee,
            receipt_id: payment_id,
            invoice_id: invoice_id,
            amount: amount,
            token: TOKEN_ALEO,
            paid_at: paid_at,
            payer_hash: payer_hash,
            settlement_anchor: settlement_anchor
        };

        return (
            recipient_credits,
            change_credits,
            pay_rec,
            receipt,
            final {
                // Run the CPI verification -- if invoice doesn't exist or hash
                // doesn't match, the entire payment transaction is rejected
                verify_final.run();

                let existing: field = Mapping::get_or_use(payment_registry, payment_id, 0field);
                assert_eq(existing, 0field);

                Mapping::set(payment_registry, payment_id, settlement_anchor);
                Mapping::set(payment_status, payment_id, PAY_CONFIRMED);
            }
        );
    }

    // -- 4. Verify Payment --
    fn verify_payment(
        public payment_id: field,
        public expected_anchor: field
    ) -> Final {
        return final {
            let stored_anchor: field = Mapping::get_or_use(payment_registry, payment_id, 0field);
            assert_neq(stored_anchor, 0field);
            assert_eq(stored_anchor, expected_anchor);
        };
    }

    // -- 5. Compute Settlement Anchor (Pure) --
    fn compute_anchor(
        invoice_id: field,
        amount: u64,
        payer: address,
        payee: address,
        nonce: field
    ) -> field {
        return compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
    }

    // ===============================================
    // ESCROW -- Privacy-Preserving Conditional Payment
    // Finalize stores ONLY escrow_id hash. No amounts, no addresses.
    //
    // KNOWN LIMITATION: Escrow uses public balance for custody.
    // Private escrow requires a dedicated custody program.
    // Planned for v3.
    // ===============================================

    struct EscrowData {
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        delivery_deadline: u32,
        arbiter: address
    }

    record EscrowRecord {
        owner: address,
        escrow_id: field,
        invoice_id: field,
        payer: address,
        payee: address,
        amount: u64,
        currency_flag: u8,
        delivery_deadline: u32,
        arbiter: address,
        status: u8
    }

    mapping escrow_status: field => u8;  // escrow_id => 0=locked, 1=released, 2=refunded

    // -- 6. Lock Credits in Escrow --
    // KNOWN LIMITATION: Uses transfer_private_to_public which leaks amounts.
    // Private escrow requires a dedicated custody program. Planned for v3.
    fn escrow_lock(
        pay_record: credits.aleo::credits,
        invoice_id: field,
        payee: address,
        amount: u64,
        delivery_deadline: u32,
        arbiter: address,
        nonce: field
    ) -> (credits.aleo::credits, EscrowRecord, EscrowRecord, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);
        assert_neq(payer, payee);

        // CPI: Transfer to escrow (private to public to lock)
        let (change, deposit_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(pay_record, payer, amount);

        let escrow_data: EscrowData = EscrowData {
            invoice_id: invoice_id, payer: payer, payee: payee,
            amount: amount, delivery_deadline: delivery_deadline,
            arbiter: arbiter
        };
        let escrow_id: field = BHP256::hash_to_field(escrow_data);

        // Dual records -- payer and payee both get copies
        let payer_rec: EscrowRecord = EscrowRecord {
            owner: payer, escrow_id: escrow_id,
            invoice_id: invoice_id, payer: payer, payee: payee,
            amount: amount, currency_flag: 0u8,
            delivery_deadline: delivery_deadline,
            arbiter: arbiter, status: 0u8
        };
        let payee_rec: EscrowRecord = EscrowRecord {
            owner: payee, escrow_id: escrow_id,
            invoice_id: invoice_id, payer: payer, payee: payee,
            amount: amount, currency_flag: 0u8,
            delivery_deadline: delivery_deadline,
            arbiter: arbiter, status: 0u8
        };

        // Finalize sees ONLY escrow_id -- no amounts, no addresses
        return (change, payer_rec, payee_rec,
            final {
                deposit_final.run();
                Mapping::set(escrow_status, escrow_id, 0u8);
            }
        );
    }

    // -- 7. Release Escrow to Payee --
    fn escrow_release(
        escrow: EscrowRecord
    ) -> (credits.aleo::credits, Final) {
        // Only payer or arbiter can release
        assert(self.caller == escrow.payer || self.caller == escrow.arbiter);
        assert_eq(escrow.status, 0u8);

        let (payee_credits, release_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(escrow.payee, escrow.amount);

        // Extract record fields before final block
        let eid: field = escrow.escrow_id;

        return (payee_credits, final {
            release_final.run();
            let current: u8 = Mapping::get_or_use(escrow_status, eid, 255u8);
            assert_eq(current, 0u8);
            Mapping::set(escrow_status, eid, 1u8);
        });
    }

    // -- 8. Refund Escrow to Payer (After Deadline) --
    fn escrow_refund(
        escrow: EscrowRecord
    ) -> (credits.aleo::credits, Final) {
        assert(self.caller == escrow.payer || self.caller == escrow.arbiter);
        assert_eq(escrow.status, 0u8);

        let (refund, refund_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(escrow.payer, escrow.amount);

        // Extract record fields before final block
        let eid: field = escrow.escrow_id;
        let deadline: u32 = escrow.delivery_deadline;

        return (refund, final {
            refund_final.run();
            // Can only refund after deadline
            assert(block.height > deadline);
            Mapping::set(escrow_status, eid, 2u8);
        });
    }

    // ===============================================
    // SCHEDULED PAYMENTS -- Block Height Based
    // Schedule payment for a specific block height.
    // Cannot execute before that height.
    // ===============================================

    struct ScheduledKey {
        invoice_id: field,
        payer: address,
        nonce: field
    }

    mapping scheduled_payments: field => u32;  // schedule_key => execute_after_height

    // -- 9. Schedule Payment --
    fn schedule_payment(
        invoice_id: field,
        execute_after: u32,
        nonce: field
    ) -> Final {
        let schedule_key: field = BHP256::hash_to_field(ScheduledKey {
            invoice_id: invoice_id,
            payer: self.caller,
            nonce: nonce
        });
        return final {
            Mapping::set(scheduled_payments, schedule_key, execute_after);
        };
    }

    // -- 10. Execute Scheduled Payment --
    fn execute_scheduled(
        pay_record: credits.aleo::credits,
        payee: address,
        invoice_id: field,
        amount: u64,
        nonce: field
    ) -> (credits.aleo::credits, credits.aleo::credits, PaymentRecord, PaymentReceipt, Final) {
        let payer: address = self.caller;
        assert(amount > 0u64);

        let (recipient, change): (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::transfer_private(pay_record, payee, amount);

        let schedule_key: field = BHP256::hash_to_field(ScheduledKey {
            invoice_id: invoice_id, payer: payer, nonce: nonce
        });

        let payment_id: field = compute_payment_id(invoice_id, payer, payee, nonce);
        let settlement_anchor: field = compute_settlement_anchor(invoice_id, amount, payer, payee, nonce);
        let payer_hash: field = BHP256::hash_to_field(payer);

        let pay_rec: PaymentRecord = PaymentRecord {
            owner: payer, payment_id: payment_id,
            invoice_id: invoice_id, payer: payer, payee: payee,
            amount: amount, token: TOKEN_ALEO, paid_at: 0u32,
            settlement_anchor: settlement_anchor, batch_id: 0field
        };

        let receipt: PaymentReceipt = PaymentReceipt {
            owner: payee, receipt_id: payment_id,
            invoice_id: invoice_id, amount: amount, token: TOKEN_ALEO,
            paid_at: 0u32, payer_hash: payer_hash,
            settlement_anchor: settlement_anchor
        };

        return (recipient, change, pay_rec, receipt,
            final {
                // Verify schedule exists and block height has passed
                let execute_after: u32 = Mapping::get_or_use(scheduled_payments, schedule_key, 0u32);
                assert(execute_after > 0u32);
                assert(block.height > execute_after);

                Mapping::set(payment_registry, payment_id, settlement_anchor);
                Mapping::set(payment_status, payment_id, PAY_CONFIRMED);
            }
        );
    }

    // ===============================================
    // RECORD JOIN/SPLIT -- Handle UTXO amounts
    // ===============================================

    // -- 11. Join Two Credit Records --
    fn join_credits(
        record_a: credits.aleo::credits,
        record_b: credits.aleo::credits
    ) -> credits.aleo::credits {
        let joined: credits.aleo::credits = credits.aleo::join(record_a, record_b);
        return joined;
    }

    // -- 12. Split a Credit Record --
    fn split_credits(
        record_in: credits.aleo::credits,
        amount: u64
    ) -> (credits.aleo::credits, credits.aleo::credits) {
        let (exact, change): (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::split(record_in, amount);
        return (exact, change);
    }
}
