# StealthAP

**Private Accounts Payable on Aleo.** Enterprise bill-pay where vendors, amounts, approvers, and spending policies stay off-chain by default — but every privacy claim is enforced by zero-knowledge verification at the contract level.

**Live demo:** <https://stealth-ap.vercel.app/>

**Deployed programs** (click any to verify on-chain):
[inv_v2](https://testnet.explorer.provable.com/program/stealthap_inv_v2.aleo) · [wf_v2](https://testnet.explorer.provable.com/program/stealthap_wf_v2.aleo) · [pay_v2](https://testnet.explorer.provable.com/program/stealthap_pay_v2.aleo) · [aud_v2](https://testnet.explorer.provable.com/program/stealthap_aud_v2.aleo) · [bat_v2](https://testnet.explorer.provable.com/program/stealthap_bat_v2.aleo)

---

## Screenshots

### Dashboard
![Dashboard](public/screenshots/dashboard.png)

### Payables — invoice management
![Payables](public/screenshots/payables.png)

### Privacy Posture — live on-chain commitments
![Privacy](public/screenshots/privacy.png)

### Landing
![Landing](public/screenshots/landing.png)

---

## The problem StealthAP solves

Every company has an Accounts Payable workflow — receive invoice, route for approval, settle payment, produce an audit trail. Today this runs on Bill.com, Ramp, Tipalti, or NetSuite. All of them:

- Leak every vendor relationship to a SaaS provider
- Expose payment amounts to anyone with database access
- Centralize approval identity — an insider can see who approved what
- Require sharing the full ledger with an auditor, even when the auditor only needs aggregates

StealthAP is the first AP platform where:

- Vendor identities stay in encrypted records. Only `invoice_id` hash reaches chain.
- Approval identities are committed but not revealed. An observer sees "approved" count, not who.
- Spending limits enforce on-chain — overbudget payments revert before settlement.
- Auditors receive scope-limited ZK proofs (Q3 total, top vendors, per-category) without the full ledger.
- A Merkle-verified vendor allowlist gates every invoice. Sanctions-screening compatible, list never disclosed.

Target user: finance teams and controllers at crypto-native companies who need operational privacy *and* audit compliance.

---

## Privacy model — what's on chain vs what isn't

| Data | On-chain (public) | In encrypted records (private) |
|---|---|---|
| Invoice | `invoice_id` field (deterministic hash) | Amount, vendor, line items, tax, dates |
| Payment | `payment_id` + `settlement_anchor` | Amount, payer, payee, token |
| Approval | Mapping key + approval count | Who approved, approval order, decision time |
| Vendor identity | Never (pseudonym rotates per invoice) | Name, address, contact, payment terms |
| Vendor allowlist | Merkle root only | The list of approved vendors |
| Spending limits | Category hash + budget field | Category name, absolute amounts |
| Audit proof | Disclosure bitmap + auditor auth | Every field not in the bitmap |

No address, no amount, no vendor name, no approver identity ever appears in a contract finalize block.

---

## Five deployed programs · 64 transitions

All five compiled under Consensus V14, `@noupgrade` (immutable), deployed on Aleo testnet.

| Program | Transitions | Role |
|---|---:|---|
| `stealthap_inv_v2.aleo` | 19 | Invoice lifecycle, dual-record creation, Merkle allowlist verify, pseudonym generation, duplicate detection |
| `stealthap_wf_v2.aleo` | 14 | Private multi-sig approval, threshold routing, spending-limit record and enforcement, delegation |
| `stealthap_pay_v2.aleo` | 13 | Private ALEO payments, escrow with arbiter, scheduled payments, CPI-verified pay, record join/split |
| `stealthap_aud_v2.aleo` | 11 | Selective-disclosure proofs, auditor authorization, compliance proofs, credit scoring |
| `stealthap_bat_v2.aleo` | 7 | Epoch-based batch settlement with commit-reveal |
| **Total** | **64** | **~2,955 lines of Leo** |

### Cross-program architecture

```
           ┌─────────────────────────────────┐
           │      stealthap_inv_v2.aleo      │
           │   (invoice state + allowlist)   │
           └───────────┬─────────────────────┘
                       │ imports
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌────▼─────────┐
│  pay_v2      │ │   wf_v2    │ │   aud_v2     │
│  (CPI verify │ │  (approve  │ │  (CPI read   │
│   invoice on │ │   routes   │ │   invoice    │
│   every pay) │ │   threshold)│ │   commitment)│
└──────────────┘ └────────────┘ └──────────────┘

           ┌─────────────────────────────────┐
           │      stealthap_bat_v2.aleo      │
           │ (epoch settlement, credits.aleo │
           │  directly — no inv_v2 coupling) │
           └─────────────────────────────────┘

         Imports: credits.aleo, test_usdcx_stablecoin.aleo, test_usad_stablecoin.aleo
```

---

## What's shipped (primary UI flows)

Every item below is reachable from the main UI with an explorer link next to the resulting tx hash. No clicking through to hidden pages required.

- **AI invoice extraction** — upload PDF, Gemini / NVIDIA NIM extracts vendor + amounts + line items with confidence scores. Corrections inline.
- **On-chain invoice creation** — `create_invoice` commits dual records (company copy + vendor copy).
- **Duplicate prevention** — `check_duplicate` blocks replay commits on top of a DB fingerprint check.
- **Per-invoice pseudonym** — `generate_pseudonym` produces a rotating identity per invoice. Same vendor paid N times → N unlinkable on-chain identities.
- **Private multi-sig approval** — `approve_private` writes a ZK commitment. Chain sees "approved" count, not approver identity.
- **Blind approval UI** — vendor names hidden by default during review to prevent approver bias. Admin-toggleable reveal.
- **BHP256-verified vendor allowlist** — `set_vendor_allowlist` commits a Merkle root. `verify_vendor_allowlist` walks an 8-level proof at invoice-create time. Vendor identity never disclosed; membership ZK-proven.
- **Threshold-routed approvals** — amount-based tier rules committed via `set_threshold`. Unauthorized approvers blocked before the DB write.
- **On-chain spending limits** — `set_spending_limit` commits per-category budgets. `record_spend` reverts the payment transition if over-budget. Real gate, not ceremony.
- **Private payment settlement** — `pay_credits_private` with automatic record-join (`credits.aleo::join`) when fragmented and automatic shield (`transfer_public_to_private`) when only public balance is available. One user click; flow picks the right branch.
- **Batch settlement** — multi-select invoices, commit-reveal epoch (`open_epoch` + N × `commit_payment` + `close_epoch`). Individual amounts/recipients invisible; only aggregate reaches finalize.
- **Selective-disclosure audit** — `generate_audit_proof` with per-field disclosure bitmap, gated to on-chain-attested invoices only (fabricated proofs impossible).
- **Privacy Posture dashboard** — live view of the user's own on-chain commitments, categorized by program, each with a direct explorer link.

## What's wired via the Protocol Operations page

One level deeper — `/dashboard/protocol` exposes every remaining contract function as a callable form with minimal inputs and a tx-hash response. Useful for auditors verifying the full contract surface works.

- **Lifecycle:** submit_invoice, mark_approved / mark_rejected / mark_paid, cancel_invoice, deactivate_vendor
- **Workflow:** submit_for_approval, approve / approve_verified, reject, delegate, check_threshold_met
- **Payment advanced:** pay_verified_credits, escrow_lock / release / refund, schedule_payment, execute_scheduled, verify_payment, join_credits, split_credits
- **Batch:** settle_slot (per-slot reveal after close_epoch)
- **Audit variants:** generate_verified_proof, selective_disclose, set_audit_authorization / revoke, generate_compliance_proof, generate_credit_proof

**Total: 37 of 44 deployed transitions reachable from one UI.** (Remaining 7 are pure helpers that don't take user input.)

## What's on the roadmap

Honest about scope — these are architectural capabilities the contracts support that don't yet have a primary-flow UI:

- USDCx / USAD payments (contracts ready, UI currently ALEO-only)
- Primary-flow UIs for escrow, scheduled payments, and compliance proofs (currently live via `/dashboard/protocol`)
- QuickBooks / Xero webhook for automatic invoice ingestion
- Multi-entity company support (one org, many legal entities)

---

## Why every primitive is enforced, not ceremonial

This is the one thing that separates us from projects that *commit* privacy primitives vs projects where the primitives *gate* real actions.

| Primitive | How it's enforced | What breaks if you bypass |
|---|---|---|
| Vendor allowlist | `verify_vendor_allowlist` runs 8-level BHP256 Merkle hash-climb on every `create_invoice` attempt | Invalid proof → on-chain return value doesn't match committed root; auditor detects |
| Spending limit | `record_spend` called in the pay flow *before* `pay_credits_private` | Over-budget → contract reverts before settlement transition runs |
| Threshold routing | Client-enforced match against committed tier list before any DB/chain write | Unauthorized approver → blocked with toast; no state change |
| Duplicate check | `check_duplicate` on-chain + DB `(company_id, vendor_id, invoice_number)` uniqueness check | Either catches the replay attempt |
| Blind approval | Approval record commits the approver identity privately; vendor name redacted client-side | Approver can't target specific vendors when deciding |
| Audit integrity | `generate_audit_proof` gated to invoices with non-null `aleo_tx_id` | Fabricated invoices (DB-only) excluded from proof totals |
| Pseudonym rotation | Every invoice calls `generate_pseudonym` with a fresh rotation nonce | No graph leak; same vendor looks different each time |

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion, Zustand |
| Data | Supabase (Postgres + RLS + Realtime) |
| Aleo integration | `@provablehq/sdk` (WASM for BHP256 Merkle tree), direct `window.shield` API for proving |
| Wallets | Shield (primary), Leo, Puzzle, Fox — plus burner-key paste for demos |
| Proving | Wallet-based (primary), Provable DPS fallback |
| Invoice OCR | NVIDIA NIM (primary) + Google Gemini (fallback) |
| Email | Resend for approval notifications |

---

## Quick start (for reviewers)

```bash
git clone <repo>
cd stealthap
npm install
cp .env.example .env.local  # fill NEXT_PUBLIC_SUPABASE_URL + ANON_KEY + NVIDIA_NIM_API_KEY
npm run dev                  # http://localhost:3000
```

### Required env

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NVIDIA_NIM_API_KEY=         # or GEMINI_API_KEY (either one works)
NEXT_PUBLIC_ALEO_NETWORK=testnet
```

### Database

Run `supabase/migration.sql` in the Supabase SQL editor. Seven tables, RLS policies, auth triggers.

---

## Reviewer test script

Five minutes end-to-end. Each step verifiable on-chain.

1. Visit the [live demo](https://stealth-ap.vercel.app/). Sign in with magic link.
2. Connect Shield Wallet (testnet).
3. `/payables` → create an invoice for any vendor. Shield signs 3 transitions: `check_duplicate`, `create_invoice`, `generate_pseudonym`.
4. `/approvals` → click **Authorize**. Shield signs `approve_private`.
5. `/settlements` → pick the invoice → **Confirm & Pay**. Shield signs `pay_credits_private` (and any prerequisite shield/join if needed).
6. `/dashboard/privacy` → see the four on-chain commitments you just generated with explorer links.
7. *(Optional)* `/dashboard/settings` → Rules tab → commit a spending limit or vendor allowlist. Then try paying — the contract enforces.
8. *(Optional)* `/dashboard/protocol` → verify every remaining contract function fires with a tx hash.

Every tx hash links to Provable's testnet explorer. Any reviewer can independently verify the claimed architecture is what's actually deployed.

---

## Contract source

All Leo source lives in `contracts/`. Each program has its own directory with `src/main.leo`, `program.json`, and build artifacts after `leo build`. See [`contracts/README.md`](contracts/README.md) for a per-program breakdown.

---

## License

MIT
