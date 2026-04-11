// =============================================
// STEALTHAP BATCH SETTLEMENT v2 (Security Hardened)
// Program: stealthap_bat_v2.aleo
// Purpose: Commit-reveal epoch-based batch payments.
//
// SECURITY FIXES v2:
//   - Access control on open_epoch / close_epoch (epoch_creator tracking)
//   - Only the address that opened an epoch can close it
//   - Honest limitation comments on public slot_count
//
// PRIVACY INNOVATION: Instead of paying invoices one
//   by one (which leaks timing and frequency patterns),
//   batch N payments into a settlement epoch.
//   - Commit phase: only payment hashes are visible
//   - Settle phase: all payments execute atomically
//   - Observer sees N slots settled at once, cannot
//     correlate individual payment timing
//
// KNOWN: slot_count is public (reveals batch size).
// Private batch size requires fixed-size arrays with
// dummy slots, planned for v3.
// =============================================

import credits.aleo;

// -- Structs (outside program for use in helpers) --

struct EpochKey {
    company_hash: field,
    epoch_number: u64
}

struct BatchCommit {
    payment_hash: field,
    epoch_id: field,
    slot: u8,
    nonce: field
}

struct BlindInput {
    data: field,
    nonce: field,
    tag: field
}

// -- Helpers (outside program block -- not entry points) --

fn compute_epoch_id(company_hash: field, epoch_number: u64) -> field {
    return BHP256::hash_to_field(EpochKey {
        company_hash: company_hash,
        epoch_number: epoch_number
    });
}

fn compute_slot_key(epoch_id: field, slot: u8) -> field {
    return BHP256::hash_to_field(BatchCommit {
        payment_hash: 0field,
        epoch_id: epoch_id,
        slot: slot,
        nonce: 0field
    });
}

fn compute_payment_hash(invoice_id: field, epoch_id: field, slot: u8, nonce: field) -> field {
    return BHP256::hash_to_field(BatchCommit {
        payment_hash: BHP256::hash_to_field(invoice_id),
        epoch_id: epoch_id,
        slot: slot,
        nonce: nonce
    });
}

program stealthap_bat_v2.aleo {

    @noupgrade
    constructor() {}

    // -- Constants --
    const EPOCH_OPEN: u8 = 0u8;
    const EPOCH_COMMITTED: u8 = 1u8;
    const EPOCH_SETTLED: u8 = 2u8;

    // -- Records --

    record BatchSlot {
        owner: address,
        epoch_id: field,
        slot: u8,
        payment_hash: field,
        invoice_id: field,
        payee: address,
        amount: u64,
        token: u8,
        nonce: field
    }

    // -- Mappings --

    mapping epoch_status: field => u8;
    mapping epoch_slots: field => field;
    mapping epoch_settled: field => bool;
    // KNOWN: slot_count is public (reveals batch size).
    // Private batch size requires fixed-size arrays with dummy slots, planned for v3.
    mapping epoch_slot_count: field => u8;

    // SECURITY FIX: Track epoch creator so only they can close it
    mapping epoch_creator: field => field;

    // ===============================================
    // TRANSITIONS
    // ===============================================

    // -- 1. Open Batch Epoch --
    // SECURITY FIX: Records the caller as the epoch creator.
    // Only the creator can close the epoch.
    fn open_epoch(
        company_hash: field,
        epoch_number: u64
    ) -> Final {
        let epoch_id: field = compute_epoch_id(company_hash, epoch_number);
        let caller_hash: field = BHP256::hash_to_field(self.caller);
        return final {
            let status: u8 = Mapping::get_or_use(epoch_status, epoch_id, 255u8);
            assert_eq(status, 255u8); // Must not exist

            Mapping::set(epoch_status, epoch_id, EPOCH_OPEN);
            Mapping::set(epoch_slot_count, epoch_id, 0u8);

            // SECURITY FIX: Record the epoch creator
            Mapping::set(epoch_creator, epoch_id, caller_hash);
        };
    }

    // -- 2. Commit Payment to Epoch --
    fn commit_payment(
        epoch_id: field,
        slot: u8,
        invoice_id: field,
        payee: address,
        amount: u64,
        token: u8,
        nonce: field
    ) -> (BatchSlot, Final) {
        assert(slot < 10u8); // Max 10 slots per epoch
        assert(amount > 0u64);

        let payment_hash: field = compute_payment_hash(invoice_id, epoch_id, slot, nonce);
        let slot_key: field = compute_slot_key(epoch_id, slot);

        let batch_slot: BatchSlot = BatchSlot {
            owner: self.caller,
            epoch_id: epoch_id,
            slot: slot,
            payment_hash: payment_hash,
            invoice_id: invoice_id,
            payee: payee,
            amount: amount,
            token: token,
            nonce: nonce
        };

        return (batch_slot, final {
            // Epoch must be open
            let status: u8 = Mapping::get_or_use(epoch_status, epoch_id, 255u8);
            assert_eq(status, EPOCH_OPEN);

            // Slot must not be already committed
            let existing: field = Mapping::get_or_use(epoch_slots, slot_key, 0field);
            assert_eq(existing, 0field);

            Mapping::set(epoch_slots, slot_key, payment_hash);

            let count: u8 = Mapping::get_or_use(epoch_slot_count, epoch_id, 0u8);
            Mapping::set(epoch_slot_count, epoch_id, count + 1u8);
        });
    }

    // -- 3. Close Epoch (Lock for Settlement) --
    // SECURITY FIX: Only the epoch creator can close it.
    fn close_epoch(
        company_hash: field,
        epoch_number: u64
    ) -> Final {
        let epoch_id: field = compute_epoch_id(company_hash, epoch_number);
        let caller_hash: field = BHP256::hash_to_field(self.caller);
        return final {
            let status: u8 = Mapping::get_or_use(epoch_status, epoch_id, 255u8);
            assert_eq(status, EPOCH_OPEN);

            // SECURITY FIX: Only the epoch creator can close the epoch
            let creator: field = Mapping::get(epoch_creator, epoch_id);
            assert_eq(creator, caller_hash);

            Mapping::set(epoch_status, epoch_id, EPOCH_COMMITTED);
        };
    }

    // -- 4. Settle Slot (Reveal + Execute Atomically) --
    fn settle_slot(
        batch_slot: BatchSlot,
        pay_record: credits.aleo::credits
    ) -> (credits.aleo::credits, credits.aleo::credits, Final) {
        // Only ALEO credits for now
        assert_eq(batch_slot.token, 0u8);

        // CPI: Transfer credits privately
        let (recipient, change): (credits.aleo::credits, credits.aleo::credits) =
            credits.aleo::transfer_private(pay_record, batch_slot.payee, batch_slot.amount);

        let slot_key: field = compute_slot_key(batch_slot.epoch_id, batch_slot.slot);

        // Extract record fields before final block (records cannot be captured in final)
        let settle_epoch_id: field = batch_slot.epoch_id;
        let settle_payment_hash: field = batch_slot.payment_hash;

        return (
            recipient,
            change,
            final {
                // Epoch must be committed (closed for new entries)
                let status: u8 = Mapping::get_or_use(epoch_status, settle_epoch_id, 255u8);
                assert_eq(status, EPOCH_COMMITTED);

                // Verify commitment matches
                let stored: field = Mapping::get_or_use(epoch_slots, slot_key, 0field);
                assert_eq(stored, settle_payment_hash);

                // Mark as settled
                Mapping::set(epoch_settled, slot_key, true);
            }
        );
    }

    // -- 5. Verify Epoch Status --
    fn verify_epoch(
        public epoch_id: field,
        public expected_status: u8
    ) -> Final {
        return final {
            let status: u8 = Mapping::get_or_use(epoch_status, epoch_id, 255u8);
            assert_eq(status, expected_status);
        };
    }

    // -- 6. Verify Slot Settlement --
    fn verify_settled(
        public epoch_id: field,
        public slot: u8
    ) -> Final {
        let slot_key: field = compute_slot_key(epoch_id, slot);
        return final {
            let settled: bool = Mapping::get_or_use(epoch_settled, slot_key, false);
            assert(settled);
        };
    }

    // -- 7. Compute Epoch ID (Pure) --
    fn compute_epoch(
        company_hash: field,
        epoch_number: u64
    ) -> field {
        return compute_epoch_id(company_hash, epoch_number);
    }
}
