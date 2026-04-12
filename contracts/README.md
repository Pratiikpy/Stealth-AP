# StealthAP Smart Contracts

Five Leo programs deployed on Aleo testnet. Each is `@noupgrade` (immutable) and compiled under Consensus V14.

## Deployed programs

| Program | Aleo ID | Purpose | Transitions (wrapped) |
|---|---|---|---|
| **Invoice** | `stealthap_inv_v2.aleo` | Create / submit / mark-approved / mark-paid / cancel / register vendor / verify allowlist / pseudonym / duplicate-check / update-vendor / deactivate-vendor | 13 |
| **Workflow** | `stealthap_wf_v2.aleo` | Threshold config / submit-for-approval / approve / approve-verified / approve-private / reject / delegate / check-threshold / set-spending-limit / record-spend | 10 |
| **Payment** | `stealthap_pay_v2.aleo` | Private single + batch settlement for ALEO credits, USDCx, USAD with settlement anchors | 10 |
| **Audit** | `stealthap_aud_v2.aleo` | Selective-disclosure audit proof generation with CPI verification | 7 |
| **Batch** | `stealthap_bat_v2.aleo` | Epoch-based batch settlement with slot commitment | 4 |

**Total: 44 transitions across 5 programs, fully deployed on testnet.**

## Privacy primitives implemented

- **Dual-record creation** (invoice): company and vendor each hold an encrypted record; linkage is private.
- **Private multi-sig approval** (`approve_private`): writes a ZK commitment to the approval mapping without revealing which approver or invoice.
- **Merkle-gated vendor allowlist** (`set_vendor_allowlist` + `verify_vendor_allowlist`): prove a vendor is on the approved list without revealing the list or which vendor.
- **Rotating pseudonyms** (`generate_pseudonym`): per-invoice unlinkable vendor identity. Breaks on-chain graph analysis.
- **Duplicate detection** (`check_duplicate`): nullifier-based double-pay prevention.
- **Threshold-routed approvals** (`set_threshold` + `submit_for_approval`): amount-based auto-approval rules enforced privately.
- **Private spending limits** (`set_spending_limit` + `record_spend`): per-category budget enforcement without disclosing totals.
- **Selective-disclosure audit proofs** (`aud_v2::generate_audit_proof`): scope-limited proofs an auditor can verify without seeing the full ledger.
- **Approval delegation** (`delegate`): vacation coverage with private delegation chains.
- **Batch settlement** (`bat_v2` open_epoch/commit_payment/close_epoch/settle_slot): N payments aggregated in one commit.

## Cross-program invocation

`pay_v2` imports `inv_v2` (for `pay_verified_credits` — payment amount must match the on-chain invoice).
`aud_v2` imports `inv_v2` (for proof-of-payment verification chains).
`bat_v2` imports `credits.aleo` + `pay_v2` primitives.

## Environment configuration

Program IDs live in `.env.local` as `NEXT_PUBLIC_<NAME>_PROGRAM_ID`. The frontend reads them through the wrapper modules under `src/lib/aleo/programs/`.

## Build + deploy

From any contract directory:

```bash
leo build --network testnet
leo deploy --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast
```

Total deployment cost for the 5 programs: **~102 credits** on testnet.

## Directory layout

```
contracts/
  stealthap_inv_v2/     # invoice lifecycle
  stealthap_wf_v2/      # approval workflow
  stealthap_pay_v2/     # payment settlement
  stealthap_aud_v2/     # audit proofs
  stealthap_bat_v2/     # batch settlement
  scripts/              # deployment + test scripts
  tests/                # integration tests
```

## Verification

Each program can be independently verified on the Provable explorer:

```
https://explorer.provable.com/v1/testnet/program/<PROGRAM_ID>
```
